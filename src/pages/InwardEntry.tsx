import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2, Calculator, CheckCircle2, AlertCircle } from 'lucide-react';

type Shape = 'Cylinder' | 'Cuboid';

export default function InwardEntry() {
    const [loading, setLoading] = useState(false);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [materialMap, setMaterialMap] = useState<Record<string, string>>({});

    // Form State
    const [materialType, setMaterialType] = useState<string>('');
    const [shape, setShape] = useState<Shape>('Cylinder');
    const [purchaseWeight, setPurchaseWeight] = useState<string>('');

    // Dimensions
    const [od, setOd] = useState<string>('');
    const [id, setId] = useState<string>('0'); // Inner Diameter
    const [length, setLength] = useState<string>('');
    const [width, setWidth] = useState<string>('');
    const [thickness, setThickness] = useState<string>('');

    // Calculated
    const [singlePieceWeight, setSinglePieceWeight] = useState<number>(0);
    const [calculatedQty, setCalculatedQty] = useState<number>(0);

    // Fetch Material Types on Load (Auto-Seed MS if missing)
    useEffect(() => {
        async function fetchMaterials() {
            const { data } = await supabase.from('material_types').select('*');

            if (data) {
                const map: Record<string, string> = {};
                data.forEach((m: { name: string; id: string }) => map[m.name] = m.id);

                setMaterialMap(map);
                // Default to first
                if (data.length > 0) setMaterialType(data[0].name);
            }
        }
        fetchMaterials();
    }, []);

    // Calculation Effect
    useEffect(() => {
        let weightInKg = 0;
        // Density 7.85 g/cm3 = 0.00000785 kg/mm3
        const DENSITY_FACTOR = 0.00000785;

        if (shape === 'Cylinder') {
            const outerR = parseFloat(od) / 2;
            const innerR = parseFloat(id) ? parseFloat(id) / 2 : 0; // Default to 0 if empty/NaN
            const h = parseFloat(thickness); // Thickness acts as length/height for rounds

            // Volume = pi * (R^2 - r^2) * h
            // Valid if OD > 0, Thickness > 0, and OD > ID (or ID is 0)
            if (outerR > 0 && h > 0 && outerR > innerR) {
                const volMm3 = Math.PI * (Math.pow(outerR, 2) - Math.pow(innerR, 2)) * h;
                weightInKg = volMm3 * DENSITY_FACTOR;
            } else if (outerR > 0 && h > 0 && innerR === 0) {
                // Solid Round
                const volMm3 = Math.PI * Math.pow(outerR, 2) * h;
                weightInKg = volMm3 * DENSITY_FACTOR;
            }
        } else {
            const l = parseFloat(length);
            const w = parseFloat(width);
            const t = parseFloat(thickness);
            if (l > 0 && w > 0 && t > 0) {
                const volMm3 = l * w * t;
                weightInKg = volMm3 * DENSITY_FACTOR;
            }
        }

        setSinglePieceWeight(weightInKg);

        const totalWeight = parseFloat(purchaseWeight);
        if (totalWeight > 0 && weightInKg > 0) {
            setCalculatedQty(Math.floor(totalWeight / weightInKg));
        } else {
            setCalculatedQty(0);
        }

    }, [shape, od, id, length, width, thickness, purchaseWeight]);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setErrorMsg(null);
        setSuccessMsg(null);

        try {
            if (!materialMap[materialType]) throw new Error('Invalid Material Type');

            const shapeData = shape === 'Cylinder'
                ? { od: parseFloat(od), id: parseFloat(id), thickness: parseFloat(thickness) }
                : { length: parseFloat(length), width: parseFloat(width), thickness: parseFloat(thickness) };

            const { error } = await supabase.from('inventory_raw').insert({
                material_type_id: materialMap[materialType],
                shape_data: shapeData,
                weight_per_piece: singlePieceWeight,
                quantity_pieces: calculatedQty,
            });

            if (error) throw error;

            setSuccessMsg(`Successfully added ${calculatedQty} pieces of ${materialType}`);
            // Reset Optional
            setPurchaseWeight('');
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to add stock';
            setErrorMsg(message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto">
            <div className="card">
                <div className="flex items-center gap-4 mb-6 pb-6 border-b border-industrial-border">
                    <div className="p-3 bg-industrial-accent/10 rounded-lg">
                        <Calculator className="w-8 h-8 text-industrial-accent" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-white">Inward Stock Entry</h2>
                        <p className="text-industrial-muted text-sm">Convert Weight to Pieces</p>
                    </div>
                </div>

                {successMsg && (
                    <div className="mb-6 p-4 bg-green-500/10 border border-green-500/20 rounded-lg flex items-center gap-3 text-green-500">
                        <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
                        <p>{successMsg}</p>
                    </div>
                )}

                {errorMsg && (
                    <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-3 text-red-500">
                        <AlertCircle className="w-5 h-5 flex-shrink-0" />
                        <p>{errorMsg}</p>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Material & Shape */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-industrial-muted mb-2">
                                Material Type
                            </label>
                            <select
                                value={materialType}
                                onChange={(e) => setMaterialType(e.target.value)}
                                className="input-field"
                            >
                                {Object.keys(materialMap).map(m => (
                                    <option key={m} value={m}>{m}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-industrial-muted mb-2">
                                Shape
                            </label>
                            <select
                                value={shape}
                                onChange={(e) => setShape(e.target.value as Shape)}
                                className="input-field"
                            >
                                <option value="Cylinder">Round (Circle/Ring)</option>
                                <option value="Cuboid">Cuboid (Flat/Plate)</option>
                            </select>
                        </div>
                    </div>

                    {/* Dimensions */}
                    <div className="bg-industrial-bg/50 p-4 rounded-lg border border-industrial-border">
                        <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-wider">Dimensions (mm)</h3>
                        <div className="grid grid-cols-3 gap-4">
                            {shape === 'Cylinder' ? (
                                <>
                                    <div>
                                        <label className="block text-xs text-industrial-muted mb-1">OD (Outer Dia)</label>
                                        <input
                                            type="number" step="0.1"
                                            className="input-field"
                                            value={od} onChange={e => setOd(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-industrial-muted mb-1">ID (Inner Dia)</label>
                                        <input
                                            type="number" step="0.1"
                                            className="input-field"
                                            value={id} onChange={e => setId(e.target.value)}
                                            placeholder="0 for solid"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-industrial-muted mb-1">Thickness</label>
                                        <input
                                            type="number" step="0.1"
                                            className="input-field"
                                            value={thickness} onChange={e => setThickness(e.target.value)}
                                            required
                                        />
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div>
                                        <label className="block text-xs text-industrial-muted mb-1">Length</label>
                                        <input
                                            type="number" step="0.1"
                                            className="input-field"
                                            value={length} onChange={e => setLength(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-industrial-muted mb-1">Width</label>
                                        <input
                                            type="number" step="0.1"
                                            className="input-field"
                                            value={width} onChange={e => setWidth(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-industrial-muted mb-1">Thickness</label>
                                        <input
                                            type="number" step="0.1"
                                            className="input-field"
                                            value={thickness} onChange={e => setThickness(e.target.value)}
                                            required
                                        />
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Purchase Info */}
                    <div>
                        <label className="block text-sm font-medium text-industrial-muted mb-2">
                            Total Purchase Weight (kg)
                        </label>
                        <input
                            type="number" step="0.01"
                            className="input-field text-lg font-bold text-industrial-accent"
                            placeholder="e.g. 5000"
                            value={purchaseWeight}
                            onChange={e => setPurchaseWeight(e.target.value)}
                            required
                        />
                    </div>

                    {/* Validated Calculation */}
                    <div className="grid grid-cols-2 gap-4 p-4 bg-industrial-bg rounded-lg border border-industrial-border">
                        <div>
                            <p className="text-xs text-industrial-muted mb-1">Weight / Piece</p>
                            <p className="text-xl font-bold text-white">
                                {singlePieceWeight.toFixed(2)} <span className="text-sm font-normal text-industrial-muted">kg</span>
                            </p>
                        </div>
                        <div>
                            <p className="text-xs text-industrial-muted mb-1">Calculated Qty</p>
                            <p className="text-2xl font-bold text-industrial-accent">
                                {calculatedQty} <span className="text-sm font-normal text-industrial-muted">pcs</span>
                            </p>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading || calculatedQty <= 0}
                        className="w-full btn-primary flex items-center justify-center gap-2"
                    >
                        {loading ? <Loader2 className="animate-spin" /> : 'Confirm Inward Entry'}
                    </button>

                </form>
            </div>
        </div>
    );
}
