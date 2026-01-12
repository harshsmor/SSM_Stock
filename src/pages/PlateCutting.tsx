import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2, Scissors, Scale, Trash2, CheckCircle2 } from 'lucide-react';

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
            const mapped = data.map((d: any) => ({
                ...d,
                material_name: d.material_types?.name,
                material_density: d.material_types?.density || 7.85
            })) as InventoryItem[];
            // Filter only plates (Rectangle) that have thickness
            const plates = mapped.filter(i => i.shape_data && i.shape_data.thickness && i.shape_data.width);
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
            // 7.85 g/cm3 = 0.00000785 kg/mm3
            const conversionFactor = density / 1000000;
            const w = volMm3 * conversionFactor;
            setCircleWeight(w);

            // Estimate Max Qty (Simple Grid)
            if (width > 0 && length > 0) {
                // +2mm kerf/clearance
                const rows = Math.floor(width / (od + 2));
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
        if (qty > 0) {
            const totalCutWeight = circleWeight * qty;
            // Leftover = Original Weight - Cut Weight
            // Assumption: Cutting consumes 1 plate? Or part of a plate?
            // "Plate Cutting" usually consumes 1 full plate to make X circles.
            // Remaining is Scrap/Inventory.
            const leftover = Math.max(0, selectedItem.weight_per_piece - totalCutWeight);
            setEstimatedLeftoverWeight(leftover);
        }
    }, [selectedItem, cutQty, circleWeight]);


    async function handleCut() {
        if (!selectedItem || !cutQty || !circleWeight) return;
        setLoading(true);
        setMsg(null);

        try {
            const qty = parseInt(cutQty);


            // 1. Deduct 1 Parent Plate
            // If we have multiple pcs of this plate, decrement by 1
            const newParentQty = selectedItem.quantity_pieces - 1;
            if (newParentQty < 0) throw new Error("Stock error");

            if (newParentQty === 0) {
                await supabase.from('inventory_raw').delete().eq('id', selectedItem.id);
            } else {
                await supabase.from('inventory_raw').update({ quantity_pieces: newParentQty }).eq('id', selectedItem.id);
            }

            // 2. Add Cut Circles to Inventory (Raw)
            // Need to find 'Material Type' for this new Shape? 
            // Or just reuse parent material type but override shape to Circle?
            // Best practice: Create new inventory item with same material_type_id but new Shape Data.

            const newShapeData = {
                type: 'Circle',
                od: parseFloat(cutOd),
                thickness: selectedItem.shape_data.thickness,
                id: 0 // Solid
            };

            // Check if Cut Circle (Raw Stock) already exists
            const { data: existingCircle } = await supabase.from('inventory_raw')
                .select('id, quantity_pieces')
                .eq('material_type_id', selectedItem.material_type_id)
                .contains('shape_data', newShapeData)
                .maybeSingle();

            if (existingCircle) {
                await supabase.from('inventory_raw').update({
                    quantity_pieces: existingCircle.quantity_pieces + qty
                }).eq('id', existingCircle.id);
            } else {
                await supabase.from('inventory_raw').insert({
                    material_type_id: selectedItem.material_type_id,
                    quantity_pieces: qty,
                    weight_per_piece: circleWeight,
                    shape_data: newShapeData
                });
            }

            // 3. Handle Leftover
            if (estimatedLeftoverWeight > 0) {
                if (leftoverAction === 'Scrap') {
                    await supabase.from('scrap_log').insert({
                        scrap_type: 'Plate_Cuttings',
                        weight_kg: estimatedLeftoverWeight
                    });
                } else {
                    // Re-enter as Inventory (Irregular? Or just smaller Plate?)
                    // Usually irregular. We might just log it as a generic "Piece" or smaller plate.
                    // For simplicity, let's just create a new 'Rectangle' with reduced dimensions? 
                    // No, dimensions are complex. Let's just create an item with remaining weight and 'Irregular' shape or similar.
                    // Or reuse Parent Shape but note weight? 
                    // Let's assume it's "Restock" -> Add back to inventory as a "Cut Piece" (maybe same material, different shape desc?)
                    // Check if identical Remnant/Irregular exists
                    const remnantShape = { ...selectedItem.shape_data, type: 'Irregular/Remnant' };
                    // Ideally we match by weight/dims. Remnants might be hard to match perfectly without strict dims.
                    // But if exact match exists, merge.

                    const { data: existingRemnant } = await supabase.from('inventory_raw')
                        .select('id, quantity_pieces')
                        .eq('material_type_id', selectedItem.material_type_id)
                        .eq('weight_per_piece', estimatedLeftoverWeight) // Match by weight for remnants
                        .contains('shape_data', { type: 'Irregular/Remnant' })
                        .maybeSingle();

                    if (existingRemnant) {
                        await supabase.from('inventory_raw').update({
                            quantity_pieces: existingRemnant.quantity_pieces + 1
                        }).eq('id', existingRemnant.id);
                    } else {
                        await supabase.from('inventory_raw').insert({
                            material_type_id: selectedItem.material_type_id,
                            quantity_pieces: 1,
                            weight_per_piece: estimatedLeftoverWeight,
                            shape_data: remnantShape
                        });
                    }
                }
            }

            setMsg({ type: 'success', text: `Processed ${qty} circles. Leftover handled as ${leftoverAction}.` });
            setCutQty('');
            setCutOd('');
            setSelectedItemId('');
            fetchInventory();

        } catch (err: unknown) {
            console.error(err);
            setMsg({ type: 'error', text: 'Operation failed' });
        } finally {
            setLoading(false);
        }
    }


    return (
        <div className="max-w-6xl mx-auto space-y-6">

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-industrial-accent/10 rounded-lg">
                        <Scissors className="w-8 h-8 text-industrial-accent" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-white">Plate Cutting</h1>
                        <p className="text-industrial-muted">Cut Circles from Plates</p>
                    </div>
                </div>
                {msg && (
                    <div className={`px-4 py-2 rounded-lg border text-sm flex items-center gap-2 animate-in fade-in ${msg.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-500' : 'bg-red-500/10 border-red-500/20 text-red-500'
                        }`}>
                        {msg.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
                        {msg.text}
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Left: Plate Selection */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="card">
                        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-industrial-accent text-black text-xs">1</span>
                            Select Plate
                        </h2>

                        <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                            {items.map(item => (
                                <div
                                    key={item.id}
                                    onClick={() => setSelectedItemId(item.id)}
                                    className={`
                                        p-4 rounded-xl border cursor-pointer transition-all duration-200 group
                                        ${selectedItemId === item.id
                                            ? 'bg-industrial-accent/10 border-industrial-accent shadow-[0_0_15px_rgba(250,204,21,0.1)]'
                                            : 'bg-industrial-bg border-industrial-border hover:border-industrial-accent/50'}
                                    `}
                                >
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <div className="font-bold text-white">{item.material_name}</div>
                                            <div className="text-xs text-industrial-muted mt-1 flex gap-2">
                                                <span>L: {item.shape_data.length}</span>
                                                <span className="text-industrial-border">|</span>
                                                <span>W: {item.shape_data.width}</span>
                                                <span className="text-industrial-border">|</span>
                                                <span className="text-industrial-accent">Thk: {item.shape_data.thickness}</span>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-xl font-bold text-white">{item.quantity_pieces} <span className="text-xs text-industrial-muted font-normal">pcs</span></div>
                                            <div className="text-xs text-industrial-muted">{item.weight_per_piece.toFixed(1)} kg/pc</div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {items.length === 0 && (
                                <div className="text-center py-8 text-industrial-muted border-2 border-dashed border-industrial-border rounded-xl">
                                    No Plate stock available.
                                </div>
                            )}
                        </div>
                    </div>

                    {selectedItem && (
                        <div className="card animate-in slide-in-from-bottom-2">
                            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-industrial-accent text-black text-xs">2</span>
                                Cutting Parameters
                            </h2>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs text-industrial-muted mb-1">Target Cut OD (mm)</label>
                                    <input
                                        type="number" step="0.1"
                                        className="input-field h-12 text-lg font-bold"
                                        placeholder="Min 10mm"
                                        value={cutOd}
                                        onChange={e => setCutOd(e.target.value)}
                                    />
                                    {maxPossibility > 0 && (
                                        <div className="text-[10px] text-green-500 mt-1">
                                            Max ~{maxPossibility} circles per plate
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <label className="block text-xs text-industrial-muted mb-1">Quantity to Cut</label>
                                    <input
                                        type="number"
                                        className="input-field h-12 text-lg font-bold"
                                        placeholder="0"
                                        value={cutQty}
                                        onChange={e => setCutQty(e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Right: Summary & Action */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="card sticky top-6 bg-industrial-bg/50 backdrop-blur-sm border-industrial-accent/20 h-full flex flex-col">
                        <h2 className="text-lg font-bold text-white mb-6">Outcome Preview</h2>

                        <div className="flex-1 space-y-6">
                            <div className="p-4 bg-industrial-surface rounded-xl border border-industrial-border">
                                <div className="text-xs text-industrial-muted uppercase tracking-wider mb-2">Each Circle</div>
                                <div className="flex items-end justify-between">
                                    <div className="text-2xl font-bold text-white">{circleWeight.toFixed(2)}</div>
                                    <div className="text-sm font-bold text-industrial-muted mb-1">kg</div>
                                </div>
                            </div>

                            <div className="p-4 bg-industrial-surface rounded-xl border border-industrial-border">
                                <div className="text-xs text-industrial-muted uppercase tracking-wider mb-2">Estimated Scraps</div>
                                <div className="flex items-end justify-between">
                                    <div className="text-2xl font-bold text-red-400">{estimatedLeftoverWeight.toFixed(2)}</div>
                                    <div className="text-sm font-bold text-industrial-muted mb-1">kg</div>
                                </div>
                                <div className="mt-4 pt-4 border-t border-industrial-border/50">
                                    <label className="block text-xs text-industrial-muted mb-2">Handle Leftover As:</label>
                                    <div className="flex p-1 bg-industrial-bg rounded-lg border border-industrial-border">
                                        <button
                                            onClick={() => setLeftoverAction('Scrap')}
                                            className={`flex-1 text-xs font-bold py-2 rounded transition-all ${leftoverAction === 'Scrap' ? 'bg-red-500/20 text-red-500' : 'text-industrial-muted'}`}
                                        >
                                            Scrap
                                        </button>
                                        <button
                                            onClick={() => setLeftoverAction('Inventory')}
                                            className={`flex-1 text-xs font-bold py-2 rounded transition-all ${leftoverAction === 'Inventory' ? 'bg-industrial-accent/20 text-industrial-accent' : 'text-industrial-muted'}`}
                                        >
                                            Restock
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <button
                            onClick={handleCut}
                            disabled={loading || !selectedItem || !cutQty || circleWeight <= 0}
                            className="w-full btn-primary h-14 mt-6 flex items-center justify-center gap-2 shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all disabled:opacity-50 disabled:hover:scale-100"
                        >
                            {loading ? <Loader2 className="animate-spin" /> : <><Scale className="w-5 h-5" /> Process Cut</>}
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
}
