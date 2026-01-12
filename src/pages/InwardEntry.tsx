import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2, PackagePlus, Save, Plus, X, Box } from 'lucide-react';

type Shape = 'Circle' | 'Rectangle';

interface MaterialType {
    id: string;
    name: string;
    density: number;
    shape: Shape;
    dimensions?: {
        od?: number;
        id?: number;
        length?: number;
        width?: number;
        thickness?: number;
    };
}

export default function InwardEntry() {
    const [loading, setLoading] = useState(false);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // Data
    const [materials, setMaterials] = useState<MaterialType[]>([]);
    const [selectedMatId, setSelectedMatId] = useState<string>('');

    // Material Management
    const [showMatModal, setShowMatModal] = useState(false);
    const [editingMat, setEditingMat] = useState<MaterialType | null>(null);

    // Modal Form State
    const [newMatName, setNewMatName] = useState('');
    const [newMatShape, setNewMatShape] = useState<Shape>('Circle');
    const [newMatDensity, setNewMatDensity] = useState<string>('7.85');
    // Modal Dims
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [newMatDims, setNewMatDims] = useState<any>({});

    // Form State for Entry
    const [purchaseWeight, setPurchaseWeight] = useState<string>('');

    // Dimensions (Entry Form)
    const [od, setOd] = useState<string>('');
    const [id, setId] = useState<string>('0');
    const [length, setLength] = useState<string>('');
    const [width, setWidth] = useState<string>('');
    const [thickness, setThickness] = useState<string>('');

    // Calculated
    const [singlePieceWeight, setSinglePieceWeight] = useState<number>(0);
    const [calculatedQty, setCalculatedQty] = useState<number>(0);

    // Initial Load
    useEffect(() => {
        fetchMaterials();
    }, []);

    async function fetchMaterials() {
        const { data } = await supabase.from('material_types').select('*').order('name');
        if (data) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const formatted: MaterialType[] = data.map((d: any) => ({
                id: d.id,
                name: d.name,
                density: d.density || 7.85,
                shape: (d.shape === 'Rectangle' || d.shape === 'Cuboid') ? 'Rectangle' : 'Circle',
                dimensions: d.dimensions || {}
            }));
            setMaterials(formatted);
            if (!selectedMatId && formatted.length > 0) {
                if (!selectedMatId) setSelectedMatId(formatted[0].id);
            }
        }
    }

    const selectedMaterial = materials.find(m => m.id === selectedMatId);

    // Auto-Fill Effect
    useEffect(() => {
        if (selectedMaterial) {
            const d = selectedMaterial.dimensions || {};
            setOd(d.od ? d.od.toString() : '');
            setId(d.id !== undefined ? d.id.toString() : '0');
            setLength(d.length ? d.length.toString() : '');
            setWidth(d.width ? d.width.toString() : '');
            setThickness(d.thickness ? d.thickness.toString() : '');
        }
    }, [selectedMatId, selectedMaterial]);

    // Calculation Effect
    useEffect(() => {
        calculateWeight();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [od, id, length, width, thickness, selectedMaterial]);

    function calculateWeight() {
        if (!selectedMaterial) return;

        let volMm3 = 0;
        // Density is usually g/cm3 (e.g. 7.85)
        // 1 g/cm3 = 0.001 g/mm3 = 0.000001 kg/mm3
        const density = selectedMaterial.density || 7.85;
        const conversionFactor = density / 1000000;

        if (selectedMaterial.shape === 'Circle') {
            const o = parseFloat(od) || 0;
            const i = parseFloat(id) || 0;
            const t = parseFloat(thickness) || 0;
            if (o > 0 && t > 0) {
                const rOut = o / 2;
                const rIn = i / 2;
                const area = Math.PI * (Math.pow(rOut, 2) - Math.pow(rIn, 2));
                volMm3 = area * t;
            }
        } else {
            const l = parseFloat(length) || 0;
            const w = parseFloat(width) || 0;
            const t = parseFloat(thickness) || 0;
            if (l > 0 && w > 0 && t > 0) {
                volMm3 = l * w * t;
            }
        }

        const weight = volMm3 * conversionFactor;
        setSinglePieceWeight(weight);

        // Update Qty if Purchase Weight is entered
        const totalWt = parseFloat(purchaseWeight) || 0;
        if (totalWt > 0 && weight > 0) {
            setCalculatedQty(Math.floor(totalWt / weight));
        } else {
            // If user clears purchase weight, maybe calc from qty? 
            // Current flow implies Purchase Weight is the source of truth for total quantity
            setCalculatedQty(0);
        }
    }

    // Recalculate Qty when Purchase Weight Changes
    useEffect(() => {
        const totalWt = parseFloat(purchaseWeight) || 0;
        if (totalWt > 0 && singlePieceWeight > 0) {
            setCalculatedQty(Math.round(totalWt / singlePieceWeight));
        } else {
            setCalculatedQty(0);
        }
    }, [purchaseWeight, singlePieceWeight]);


    async function handleInward(e: FormEvent) {
        e.preventDefault();
        if (!selectedMaterial || !purchaseWeight) return;

        setLoading(true);
        setErrorMsg(null);
        setSuccessMsg(null);

        try {

            const qty = calculatedQty;

            const shapeData: any = { type: selectedMaterial.shape };
            if (selectedMaterial.shape === 'Circle') {
                if (od) shapeData.od = parseFloat(od);
                if (id) shapeData.id = parseFloat(id);
                if (thickness) shapeData.thickness = parseFloat(thickness);
            } else {
                if (length) shapeData.length = parseFloat(length);
                if (width) shapeData.width = parseFloat(width);
                if (thickness) shapeData.thickness = parseFloat(thickness);
            }

            const item = {
                material_type_id: selectedMaterial.id,
                quantity_pieces: qty,
                weight_per_piece: singlePieceWeight,
                shape_data: shapeData
            };

            // Validation
            if (selectedMaterial.shape === 'Circle') {
                if (!od) throw new Error("Outer Diameter (OD) is required for Round items.");
                if (!thickness) throw new Error("Thickness is required.");
            } else {
                if (!length || !width) throw new Error("Length and Width are required for Rectangular items.");
                if (!thickness) throw new Error("Thickness is required.");
            }

            // 1. Check for existing item with identical dimensions & material
            const { data: existingItem } = await supabase
                .from('inventory_raw')
                .select('id, quantity_pieces')
                .eq('material_type_id', selectedMaterial.id)
                .contains('shape_data', shapeData) // Exact JSON match for dims
                .maybeSingle();

            if (existingItem) {
                // Update existing
                const { error } = await supabase.from('inventory_raw')
                    .update({
                        quantity_pieces: existingItem.quantity_pieces + qty
                    })
                    .eq('id', existingItem.id);
                if (error) throw error;
            } else {
                // Insert New
                const { error } = await supabase.from('inventory_raw').insert(item);
                if (error) throw error;
            }

            setSuccessMsg(`Successfully added ${qty} pieces of ${selectedMaterial.name}`);
            setPurchaseWeight('');
            // Optional: Reset dims? No, keep them for repeated entry

        } catch (err: any) {
            setErrorMsg(err.message || 'Failed to add inventory.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    async function handleSaveMaterial() {
        if (!newMatName) return;
        const den = parseFloat(newMatDensity) || 7.85;

        // Clean Dimensions
        const d: any = {};
        if (newMatShape === 'Circle') {
            if (newMatDims.od) d.od = parseFloat(newMatDims.od);
            if (newMatDims.id) d.id = parseFloat(newMatDims.id);
            if (newMatDims.thickness) d.thickness = parseFloat(newMatDims.thickness);
        } else {
            if (newMatDims.length) d.length = parseFloat(newMatDims.length);
            if (newMatDims.width) d.width = parseFloat(newMatDims.width);
            if (newMatDims.thickness) d.thickness = parseFloat(newMatDims.thickness);
        }

        const payload = {
            name: newMatName,
            shape: newMatShape,
            density: den,
            dimensions: d
        };

        if (editingMat) {
            await supabase.from('material_types').update(payload).eq('id', editingMat.id);
        } else {
            await supabase.from('material_types').insert(payload);
        }

        setShowMatModal(false);
        setEditingMat(null);
        setNewMatName('');
        setNewMatDims({});
        fetchMaterials();
    }


    return (
        <div className="max-w-6xl mx-auto space-y-6">

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-industrial-accent/10 rounded-lg">
                        <PackagePlus className="w-8 h-8 text-industrial-accent" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-white">Inward Entry</h1>
                        <p className="text-industrial-muted">Record new material arrival</p>
                    </div>
                </div>

                {successMsg && (
                    <div className="bg-green-500/10 text-green-500 px-4 py-2 rounded-lg border border-green-500/20 text-sm animate-in fade-in">
                        {successMsg}
                    </div>
                )}
                {errorMsg && (
                    <div className="bg-red-500/10 text-red-500 px-4 py-2 rounded-lg border border-red-500/20 text-sm animate-in fade-in">
                        {errorMsg}
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Left Column: Material Selection & Form */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="card bg-industrial-surface border-industrial-border p-6 shadow-lg">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                <Box className="w-5 h-5 text-industrial-accent" />
                                Material Details
                            </h2>
                            <button
                                onClick={() => { setEditingMat(null); setNewMatName(''); setNewMatDims({}); setShowMatModal(true); }}
                                className="text-xs btn-secondary py-2 px-3 flex items-center gap-2"
                            >
                                <Plus className="w-3 h-3" /> New Type
                            </button>
                        </div>

                        <form onSubmit={handleInward} className="space-y-6">
                            <div>
                                <label className="block text-sm text-industrial-muted mb-2">Select Material</label>
                                <select
                                    className="input-field h-12 text-lg"
                                    value={selectedMatId}
                                    onChange={e => setSelectedMatId(e.target.value)}
                                    required
                                >
                                    {materials.map(m => (
                                        <option key={m.id} value={m.id}>{m.name} ({m.shape})</option>
                                    ))}
                                </select>
                            </div>

                            {/* Dynamic Dimensions Form */}
                            {selectedMaterial && (
                                <div className="p-4 bg-industrial-bg rounded-xl border border-industrial-border/50">
                                    <h3 className="text-xs font-bold text-industrial-muted uppercase tracking-wider mb-3">Dimensions (mm)</h3>
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                        {selectedMaterial.shape === 'Circle' ? (
                                            <>
                                                <div>
                                                    <label className="block text-xs text-industrial-muted mb-1">OD</label>
                                                    <input type="number" step="0.1" className="input-field" value={od} onChange={e => setOd(e.target.value)} required />
                                                </div>
                                                <div>
                                                    <label className="block text-xs text-industrial-muted mb-1">ID</label>
                                                    <input type="number" step="0.1" className="input-field" value={id} onChange={e => setId(e.target.value)} required />
                                                </div>
                                                <div>
                                                    <label className="block text-xs text-industrial-muted mb-1">Thickness</label>
                                                    <input type="number" step="0.1" className="input-field" value={thickness} onChange={e => setThickness(e.target.value)} required />
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <div>
                                                    <label className="block text-xs text-industrial-muted mb-1">Length</label>
                                                    <input type="number" step="0.1" className="input-field" value={length} onChange={e => setLength(e.target.value)} required />
                                                </div>
                                                <div>
                                                    <label className="block text-xs text-industrial-muted mb-1">Width</label>
                                                    <input type="number" step="0.1" className="input-field" value={width} onChange={e => setWidth(e.target.value)} required />
                                                </div>
                                                <div>
                                                    <label className="block text-xs text-industrial-muted mb-1">Thickness</label>
                                                    <input type="number" step="0.1" className="input-field" value={thickness} onChange={e => setThickness(e.target.value)} required />
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-industrial-muted mb-2">Total Purchase Weight (kg)</label>
                                <div className="relative">
                                    <input
                                        type="number" step="0.01"
                                        className="input-field text-xl font-bold text-industrial-accent pl-4 h-14"
                                        placeholder="0.00"
                                        value={purchaseWeight}
                                        onChange={e => setPurchaseWeight(e.target.value)}
                                        required
                                    />
                                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-industrial-muted font-bold">KG</span>
                                </div>
                            </div>

                            <button type="submit" disabled={loading} className="w-full btn-primary h-14 text-lg flex items-center justify-center gap-2 shadow-lg hover:shadow-xl hover:scale-[1.01] transition-all">
                                {loading ? <Loader2 className="animate-spin" /> : 'Confirm Inward Entry'}
                            </button>
                        </form>
                    </div>
                </div>

                {/* Right Column: Dynamic Calculation Preview */}
                <div className="space-y-6">
                    <div className="card bg-industrial-surface border-industrial-border p-6 shadow-lg h-full flex flex-col justify-center items-center text-center">
                        <div className="mb-4 p-4 bg-industrial-accent/10 rounded-full">
                            <Box className="w-12 h-12 text-industrial-accent" />
                        </div>
                        <h3 className="text-xl font-bold text-white mb-1">Calculated Pieces</h3>
                        <p className="text-sm text-industrial-muted mb-6">Based on weight & dimensions</p>

                        <div className="text-6xl font-black text-white tracking-tighter mb-2">
                            {calculatedQty}
                        </div>
                        <div className="text-lg font-medium text-industrial-accent uppercase tracking-widest">Pieces</div>

                        <div className="mt-8 w-full pt-6 border-t border-industrial-border grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-xs text-industrial-muted uppercase tracking-wider mb-1">Unit Weight</p>
                                <p className="text-lg font-bold text-white">{singlePieceWeight.toFixed(2)} kg</p>
                            </div>
                            <div>
                                <p className="text-xs text-industrial-muted uppercase tracking-wider mb-1">Density</p>
                                <p className="text-lg font-bold text-white">{selectedMaterial?.density || 7.85}</p>
                            </div>
                        </div>
                    </div>
                </div>

            </div>

            {/* Modal for Material Type */}
            {showMatModal && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
                    <div className="card w-full max-w-md animate-in zoom-in-95">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-white">{editingMat ? 'Edit Material' : 'New Material'}</h3>
                            <button onClick={() => setShowMatModal(false)}><X className="w-6 h-6 text-industrial-muted hover:text-white" /></button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs text-industrial-muted mb-1">Name</label>
                                <input className="input-field" value={newMatName} onChange={e => setNewMatName(e.target.value)} placeholder="e.g. MS Plate" />
                            </div>
                            <div>
                                <label className="block text-xs text-industrial-muted mb-1">Density (g/cm3)</label>
                                <input type="number" step="0.01" className="input-field" value={newMatDensity} onChange={e => setNewMatDensity(e.target.value)} />
                            </div>
                            <div>
                                <label className="block text-xs text-industrial-muted mb-1">Shape</label>
                                <select
                                    className="input-field"
                                    value={newMatShape}
                                    onChange={e => setNewMatShape(e.target.value as Shape)}
                                >
                                    <option value="Circle">Circle / Round</option>
                                    <option value="Rectangle">Rectangle / Plate</option>
                                </select>
                            </div>

                            <div className="pt-4 border-t border-industrial-border mt-4">
                                <p className="text-xs font-bold text-white mb-3">Preset Dimensions (Optional)</p>
                                <div className="grid grid-cols-2 gap-3">
                                    {newMatShape === 'Circle' ? (
                                        <>
                                            <div>
                                                <label className="block text-[10px] text-industrial-muted">OD</label>
                                                <input type="number" step="0.1" className="input-field text-sm"
                                                    value={newMatDims.od || ''} onChange={e => setNewMatDims({ ...newMatDims, od: e.target.value })} />
                                            </div>
                                            <div>
                                                <label className="block text-[10px] text-industrial-muted">ID</label>
                                                <input type="number" step="0.1" className="input-field text-sm"
                                                    value={newMatDims.id || ''} onChange={e => setNewMatDims({ ...newMatDims, id: e.target.value })} />
                                            </div>
                                            <div className="col-span-2">
                                                <label className="block text-[10px] text-industrial-muted">Thickness</label>
                                                <input type="number" step="0.1" className="input-field text-sm"
                                                    value={newMatDims.thickness || ''} onChange={e => setNewMatDims({ ...newMatDims, thickness: e.target.value })} />
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div>
                                                <label className="block text-[10px] text-industrial-muted">Length</label>
                                                <input type="number" step="0.1" className="input-field text-sm"
                                                    value={newMatDims.length || ''} onChange={e => setNewMatDims({ ...newMatDims, length: e.target.value })} />
                                            </div>
                                            <div>
                                                <label className="block text-[10px] text-industrial-muted">Width</label>
                                                <input type="number" step="0.1" className="input-field text-sm"
                                                    value={newMatDims.width || ''} onChange={e => setNewMatDims({ ...newMatDims, width: e.target.value })} />
                                            </div>
                                            <div className="col-span-2">
                                                <label className="block text-[10px] text-industrial-muted">Thickness</label>
                                                <input type="number" step="0.1" className="input-field text-sm"
                                                    value={newMatDims.thickness || ''} onChange={e => setNewMatDims({ ...newMatDims, thickness: e.target.value })} />
                                            </div>
                                        </>
                                    )}
                                </div>
                                <button onClick={handleSaveMaterial} className="w-full btn-primary flex justify-center gap-2 mt-6">
                                    <Save className="w-4 h-4" /> Save Material
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
