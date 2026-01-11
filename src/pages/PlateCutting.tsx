import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2, Scissors, AlertTriangle } from 'lucide-react';

// Types
interface InventoryItem {
    id: string;
    material_type_id: string;
    shape_data: { length?: number; width?: number; thickness?: number; od?: number; type?: string };
    weight_per_piece: number;
    quantity_pieces: number;
    total_weight_kg: number;
    material_name?: string;
    material_density?: number;
}

export default function PlateCutting() {
    const [loading, setLoading] = useState(false);
    const [items, setItems] = useState<InventoryItem[]>([]);
    const [selectedItemId, setSelectedItemId] = useState<string>('');

    // Inputs
    const [cutOd, setCutOd] = useState<string>('');
    const [cutQty, setCutQty] = useState<string>('');

    // Leftover Logic
    const [leftoverAction, setLeftoverAction] = useState<'Scrap' | 'Inventory'>('Scrap');

    // Calculated
    const [circleWeight, setCircleWeight] = useState<number>(0);
    const [estimatedLeftoverWeight, setEstimatedLeftoverWeight] = useState<number>(0);
    const [maxPossibility, setMaxPossibility] = useState<number>(0);

    const [msg, setMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    useEffect(() => {
        fetchInventory();
    }, []);

    async function fetchInventory() {
        const { data } = await supabase
            .from('inventory_raw')
            .select('*, material_types(name, density)')
            .gt('quantity_pieces', 0);

        if (data) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const mapped = data.map((d: any) => ({ // Keeping d as any for supabase result simpler, or cast to partial InventoryItem
                ...d,
                material_name: d.material_types?.name,
                material_density: d.material_types?.density || 7.85
            })) as InventoryItem[];
            // Filter only plates (Cuboids) for cutting? Or allow others?
            // Usually plates are cut. 
            // Let's filter for items that have length/width/thickness
            const plates = mapped.filter(i => i.shape_data && i.shape_data.thickness);
            setItems(plates);
        }
    }

    const selectedItem = items.find(i => i.id === selectedItemId);

    // Calculation Effect
    useEffect(() => {
        if (!selectedItem || !cutOd) {
            setCircleWeight(0);
            setMaxPossibility(0);
            return;
        }

        const od = parseFloat(cutOd);
        const thickness = selectedItem.shape_data.thickness || 0;
        const density = selectedItem.material_density || 7.85;
        const width = selectedItem.shape_data.width || 0;
        const length = selectedItem.shape_data.length || 0;

        if (od > 0 && thickness > 0) {
            const radius = od / 2;
            const volMm3 = Math.PI * Math.pow(radius, 2) * thickness;
            // Density g/cm3 to kg/mm3: (g -> kg / 1000) / (cm3 -> mm3 * 1000)
            // 7.85 g/cm3 = 0.00785 g/mm3 = 0.00000785 kg/mm3
            const conversionFactor = density / 1000000;
            const w = volMm3 * conversionFactor;
            setCircleWeight(w);

            // Estimate Max Qty (Simple Bounding Box)
            // Area of Plate / Area of Circle (Rough upper bound)
            // Or (Floor(L/OD) * Floor(W/OD))
            if (width > 0 && length > 0) {
                const rows = Math.floor(width / (od + 2)); // +2mm kerf/clearance
                const cols = Math.floor(length / (od + 2));
                setMaxPossibility(rows * cols);
            }
        }
    }, [selectedItemId, cutOd, selectedItem]);

    // Leftover Effect
    useEffect(() => {
        if (!selectedItem || !cutQty || circleWeight <= 0) {
            setEstimatedLeftoverWeight(0);
            return;
        }
        const qty = parseInt(cutQty);
        const totalCutWeight = qty * circleWeight;
        const remaining = selectedItem.weight_per_piece - totalCutWeight;
        setEstimatedLeftoverWeight(Math.max(0, remaining));

    }, [cutQty, circleWeight, selectedItem]);


    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!selectedItem) return;

        setLoading(true);
        setMsg(null);

        const qtyToCut = parseInt(cutQty);

        try {
            if (qtyToCut > (selectedItem.quantity_pieces * (maxPossibility || 9999))) {
                // Relaxed validation: Just check we don't consume more weight than exists?
                // Actually we are cutting ONE plate. 
            }
            if (estimatedLeftoverWeight < 0) {
                throw new Error('Cut weight exceeds available plate weight');
            }

            // 1. Deduct Parent Plate (1 unit)
            const { error: updateParent } = await supabase
                .from('inventory_raw')
                .update({ quantity_pieces: selectedItem.quantity_pieces - 1 })
                .eq('id', selectedItemId);
            if (updateParent) throw updateParent;

            // 2. Add Cut Circles
            // Only add if qty > 0
            if (qtyToCut > 0) {
                // Check if 'MS Circle' type exists, else use same type
                // logic simplified: try to match 'Circle' in name or reuse
                const targetTypeId = selectedItem.material_type_id;
                // Better: Pass shape_data type='Circle'
                await supabase.from('inventory_raw').insert({
                    material_type_id: targetTypeId, // Inherit material type (e.g. MS)
                    shape_data: { type: 'Circle', od: parseFloat(cutOd), thickness: selectedItem.shape_data.thickness },
                    weight_per_piece: circleWeight,
                    quantity_pieces: qtyToCut,
                    // created_from: selectedItem.id // If we had lineage column
                });
            }

            // 3. Handle Leftover
            if (estimatedLeftoverWeight > 0) {
                if (leftoverAction === 'Inventory') {
                    // Re-enter as Offcut
                    await supabase.from('inventory_raw').insert({
                        material_type_id: selectedItem.material_type_id,
                        shape_data: { type: 'Offcut', from_plate: true, original_id: selectedItem.id },
                        weight_per_piece: estimatedLeftoverWeight,
                        quantity_pieces: 1
                    });
                } else {
                    // Scrap
                    await supabase.from('scrap_log').insert({
                        scrap_type: 'Plate_Skeleton',
                        weight_kg: estimatedLeftoverWeight
                    });
                }
            }

            setMsg({ type: 'success', text: `Cut processed! ${qtyToCut} circles created.` });
            setCutQty('');
            setCutOd('');
            fetchInventory();

        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Processing failed';
            setMsg({ type: 'error', text: message });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div className="card">
                <div className="flex items-center gap-4 mb-6 pb-6 border-b border-industrial-border">
                    <div className="p-3 bg-industrial-accent/10 rounded-lg">
                        <Scissors className="w-8 h-8 text-industrial-accent" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-white">Plate Cutting</h2>
                        <p className="text-industrial-muted text-sm">Cut Circles & Manage Leftovers</p>
                    </div>
                </div>

                {msg && (
                    <div className={`p-4 rounded-lg mb-6 flex items-center gap-2 ${msg.type === 'success' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
                        }`}>
                        {msg.type === 'error' && <AlertTriangle className="w-5 h-5" />}
                        {msg.text}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-8">
                    {/* Source Selection */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-industrial-muted mb-2">
                                Select Source Plate
                            </label>
                            <select
                                value={selectedItemId}
                                onChange={e => setSelectedItemId(e.target.value)}
                                className="input-field"
                                required
                            >
                                <option value="">-- Select Plate --</option>
                                {items.map(i => (
                                    <option key={i.id} value={i.id}>
                                        {i.material_name} | {i.shape_data?.thickness}mm Thk | {i.weight_per_piece.toFixed(1)}kg
                                    </option>
                                ))}
                            </select>

                            {selectedItem && (
                                <div className="mt-4 p-3 bg-industrial-bg rounded text-sm text-industrial-muted space-y-1">
                                    <p>Dims: {selectedItem.shape_data.length} x {selectedItem.shape_data.width} x {selectedItem.shape_data.thickness} mm</p>
                                    <p>Available Qty: {selectedItem.quantity_pieces}</p>
                                </div>
                            )}
                        </div>

                        {/* Calculations */}
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-industrial-muted mb-2">
                                    Cut OD (mm)
                                </label>
                                <input
                                    type="number" step="0.1"
                                    className="input-field"
                                    value={cutOd}
                                    onChange={e => setCutOd(e.target.value)}
                                    placeholder="e.g. 150"
                                    required
                                />
                            </div>

                            {circleWeight > 0 && (
                                <div className="p-3 bg-industrial-accent/5 border border-industrial-accent/20 rounded-lg">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-sm text-industrial-muted">Weight / Circle</span>
                                        <span className="text-lg font-mono text-industrial-accent">{circleWeight.toFixed(2)} kg</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm text-industrial-muted">Max Est. Qty</span>
                                        <span className="text-lg font-mono text-white">{maxPossibility} pcs</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {circleWeight > 0 && (
                        <div className="pt-6 border-t border-industrial-border">
                            <h3 className="text-lg font-bold text-white mb-4">Output & Leftover</h3>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div>
                                    <label className="block text-sm font-medium text-industrial-muted mb-2">
                                        Quantity to Cut
                                    </label>
                                    <input
                                        type="number"
                                        className="input-field"
                                        value={cutQty}
                                        onChange={e => setCutQty(e.target.value)}
                                        max={maxPossibility > 0 ? maxPossibility : undefined}
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-industrial-muted mb-2">
                                        Leftover Weight
                                    </label>
                                    <div className="input-field bg-industrial-bg flex items-center justify-between">
                                        <span className="text-white font-mono">{estimatedLeftoverWeight.toFixed(2)}</span>
                                        <span className="text-industrial-muted text-xs">kg</span>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-industrial-muted mb-2">
                                        Leftover Action
                                    </label>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setLeftoverAction('Scrap')}
                                            className={`flex-1 py-2 px-3 rounded-lg border text-sm transition-colors ${leftoverAction === 'Scrap'
                                                ? 'bg-red-500/20 border-red-500/50 text-red-500'
                                                : 'border-industrial-border text-industrial-muted hover:bg-industrial-bg'
                                                }`}
                                        >
                                            Scrap
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setLeftoverAction('Inventory')}
                                            className={`flex-1 py-2 px-3 rounded-lg border text-sm transition-colors ${leftoverAction === 'Inventory'
                                                ? 'bg-blue-500/20 border-blue-500/50 text-blue-500'
                                                : 'border-industrial-border text-industrial-muted hover:bg-industrial-bg'
                                                }`}
                                        >
                                            Restock
                                        </button>
                                    </div>
                                    <p className="text-xs text-industrial-muted mt-2 px-1">
                                        {leftoverAction === 'Scrap'
                                            ? 'Logs to Scrap Log (Plate Skeleton)'
                                            : 'Creates new Inventory Item (Offcut)'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading || !selectedItemId || !cutQty}
                        className="w-full btn-primary flex items-center justify-center gap-2"
                    >
                        {loading ? <Loader2 className="animate-spin" /> : <><Scissors className="w-5 h-5" /> Process Plate Cutting</>}
                    </button>
                </form>
            </div>
        </div>
    );
}
