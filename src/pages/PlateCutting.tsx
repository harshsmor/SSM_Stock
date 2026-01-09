import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2, Scissors, AlertTriangle } from 'lucide-react';

// Types
interface InventoryItem {
    id: string;
    material_type_id: string;
    shape_data: any;
    weight_per_piece: number;
    quantity_pieces: number;
    total_weight_kg: number;
    material_name?: string; // We'll join this manually
}

export default function PlateCutting() {
    const [loading, setLoading] = useState(false);
    const [items, setItems] = useState<InventoryItem[]>([]);
    const [selectedItemId, setSelectedItemId] = useState<string>('');

    // Inputs
    const [cutQty, setCutQty] = useState<string>('');
    const [targetWeightPerPiece, setTargetWeightPerPiece] = useState<string>('');

    // Survivor Logic
    const [survivorExists, setSurvivorExists] = useState<boolean>(false);
    const [offcutWeight, setOffcutWeight] = useState<string>('');

    const [msg, setMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    useEffect(() => {
        fetchInventory();
    }, []);

    async function fetchInventory() {
        // Join with material_types would be nice, but let's do two queries for simplicity or use view.
        // Actually Supabase JS can do deep select.
        const { data } = await supabase
            .from('inventory_raw')
            .select('*, material_types(name)')
            .gt('quantity_pieces', 0); // Only available items

        if (data) {
            const mapped = data.map((d: any) => ({
                ...d,
                material_name: d.material_types?.name
            }));
            setItems(mapped);
        }
    }

    const selectedItem = items.find(i => i.id === selectedItemId);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!selectedItem) return;

        setLoading(true);
        setMsg(null);

        const qtyToCut = parseInt(cutQty);
        const weightOneOutput = parseFloat(targetWeightPerPiece);
        const survivorWeight = survivorExists ? parseFloat(offcutWeight) : 0;

        try {
            if (qtyToCut > selectedItem.quantity_pieces) throw new Error('Insufficient Stock quantity');

            // Note: Logic says "Cutting circular shapes from a rectangular plate"
            // Usually means consuming 1 Plate to make N Circles? 
            // OR Consuming N Plates?
            // "Select Plate Source -> Enter 'Cut Qty' (e.g. 50 circles)".
            // "Calculate consumed_weight = 50 * Weight of 1 Circle".
            // This implies we are processing ONE PLATE (or a specific piece) entirely.
            // So, we deduct 1 Piece from Inventory Raw (The Parent Plate).
            // Logic:
            // 1. Deduct 1 Piece from `inventory_raw` (The Plate).
            // 2. Add `survivor` as NEW `inventory_raw` item (if yes).
            // 3. Log Scrap (difference).
            // 4. Note: The prompt doesn't explicitly 'Add Finished Circles' in the Survivor section, 
            //    but it implies we are making them. 
            //    Wait, "Action: ... Log Scrap ...". It doesn't say "Add Circles to Inventory".
            //    But Section C (Billa) explicitly says "Add Finished Qty".
            //    Section B (Survivor) focuses on "Scrap/Survivor".
            //    I will assume we SHOULD track the produced circles? 
            //    Actually, step 4 says "Inward Calculator -> Insert into inventory_raw".
            //    If we cut circles, they become "Raw Circles" for the next step (Billa).
            //    So we should probably Add the 50 Circles to `inventory_raw` as well?
            //    The prompt is silent on where the "50 circles" go. 
            //    "Billa Logic... UI Input: Select Raw Circle".
            //    So yes, the Output of Plate Cutting MUST be "Raw Circles".

            // REVISED PLAN:
            // 1. Deduct 1 Piece of Parent Plate.
            // 2. Add `qtyToCut` pieces of "Circle" (Calculated Weight) to `inventory_raw`.
            // 3. Add `survivor` (if any) to `inventory_raw` (Scrap Plate).
            // 4. Log Scrap.

            const parentWeight = selectedItem.weight_per_piece;
            const totalConsumedWeight = qtyToCut * weightOneOutput;

            if (totalConsumedWeight > parentWeight) {
                throw new Error(`Output weight (${totalConsumedWeight.toFixed(2)}kg) exceeds Parent Plate weight (${parentWeight.toFixed(2)}kg)`);
            }

            const scrapWeight = parentWeight - totalConsumedWeight - survivorWeight;

            if (scrapWeight < 0) {
                throw new Error('Invalid calculation: Scrap weight is negative.');
            }

            // DB Transaction (Simulated via sequential calls)

            // 1. Deduct Parent
            // NOTE: I don't have this RPC. I should use standard update.
            // But concurrent access is issue. Single User -> Standard update is fine.

            const { error: updateParent } = await supabase
                .from('inventory_raw')
                .update({ quantity_pieces: selectedItem.quantity_pieces - 1 })
                .eq('id', selectedItemId);

            if (updateParent) throw updateParent;

            // 2. Add Produced Circles (We need a 'MS Circle' material ID)
            // We'll search for 'MS Circle' or just use the same material ID if not found?
            // Better to query material types.
            const { data: matData } = await supabase.from('material_types').select('id').eq('name', 'MS Circle').single();
            const circleMatId = matData?.id || selectedItem.material_type_id; // Fallback

            const { error: addCircles } = await supabase
                .from('inventory_raw')
                .insert({
                    material_type_id: circleMatId,
                    shape_data: { type: 'Circle', from_plate_id: selectedItem.id }, // Metadata
                    weight_per_piece: weightOneOutput,
                    quantity_pieces: qtyToCut
                });

            if (addCircles) throw addCircles;

            // 3. Add Survivor (Offcut)
            if (survivorExists && survivorWeight > 0) {
                const { error: addSurvivor } = await supabase
                    .from('inventory_raw')
                    .insert({
                        material_type_id: selectedItem.material_type_id,
                        shape_data: { type: 'Offcut', from_plate_id: selectedItem.id },
                        weight_per_piece: survivorWeight,
                        quantity_pieces: 1
                    });
                if (addSurvivor) throw addSurvivor;
            }

            // 4. Log Scrap
            if (scrapWeight > 0) {
                const { error: addScrap } = await supabase
                    .from('scrap_log')
                    .insert({
                        scrap_type: survivorExists ? 'Plate_Skeleton' : 'Plate_Skeleton', // Or 'Offcuts' if small? "Survivor" implies Reusable. "Scrap" is Waste.
                        weight_kg: scrapWeight
                    });
                if (addScrap) throw addScrap;
            }

            setMsg({ type: 'success', text: 'Cutting processed successfully!' });
            setCutQty('');
            setOffcutWeight('');
            setTargetWeightPerPiece('');
            fetchInventory(); // Refresh

        } catch (err: any) {
            setMsg({ type: 'error', text: err.message });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-3xl mx-auto space-y-6">
            <div className="card">
                <div className="flex items-center gap-4 mb-6 pb-6 border-b border-industrial-border">
                    <div className="p-3 bg-industrial-accent/10 rounded-lg">
                        <Scissors className="w-8 h-8 text-industrial-accent" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-white">Plate Cutting (Survivor Logic)</h2>
                        <p className="text-industrial-muted text-sm">Cut Circles from Plate & Log Offcuts</p>
                    </div>
                </div>

                {msg && (
                    <div className={`p-4 rounded-lg mb-6 flex items-center gap-2 ${msg.type === 'success' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
                        }`}>
                        {msg.type === 'error' && <AlertTriangle className="w-5 h-5" />}
                        {msg.text}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Source Selection */}
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
                            <option value="">-- Select Inventory --</option>
                            {items.map(i => (
                                <option key={i.id} value={i.id}>
                                    {i.material_name} | {i.weight_per_piece.toFixed(2)}kg | Qty: {i.quantity_pieces}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Output Specs */}
                        <div className="bg-industrial-bg/50 p-4 rounded-lg border border-industrial-border">
                            <h3 className="font-bold text-white mb-4">Output Circles</h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs text-industrial-muted mb-1">Target Weight per Circle (kg)</label>
                                    <input
                                        type="number" step="0.01"
                                        className="input-field"
                                        value={targetWeightPerPiece}
                                        onChange={e => setTargetWeightPerPiece(e.target.value)}
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-industrial-muted mb-1">Quantity (Circles)</label>
                                    <input
                                        type="number"
                                        className="input-field"
                                        value={cutQty}
                                        onChange={e => setCutQty(e.target.value)}
                                        required
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Survivor Specs */}
                        <div className="bg-industrial-bg/50 p-4 rounded-lg border border-industrial-border">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-bold text-white">Survivor Offcut</h3>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        className="w-4 h-4 rounded border-industrial-border bg-industrial-surface text-industrial-accent focus:ring-industrial-accent"
                                        checked={survivorExists}
                                        onChange={e => setSurvivorExists(e.target.checked)}
                                    />
                                    <span className="text-sm text-industrial-muted">Did offcut survive?</span>
                                </label>
                            </div>

                            {survivorExists ? (
                                <div>
                                    <label className="block text-xs text-industrial-muted mb-1">Offcut Weight (kg)</label>
                                    <input
                                        type="number" step="0.01"
                                        className="input-field"
                                        value={offcutWeight}
                                        onChange={e => setOffcutWeight(e.target.value)}
                                        required={survivorExists}
                                    />
                                    <p className="text-xs text-green-500 mt-2">
                                        * Will be added back to inventory as Scrap Plate
                                    </p>
                                </div>
                            ) : (
                                <div className="h-20 flex items-center justify-center text-industrial-muted text-sm italic">
                                    No reusable offcut. <br /> Remaining weight goes to Skeleton Scrap.
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="p-4 bg-industrial-bg rounded-lg border border-industrial-border flex items-center justify-between">
                        <div className="text-sm text-industrial-muted">
                            Estimated Scrap: <br />
                            <span className="text-xl font-bold text-white">
                                {selectedItem && cutQty && targetWeightPerPiece
                                    ? Math.max(0, selectedItem.weight_per_piece - (parseInt(cutQty) * parseFloat(targetWeightPerPiece)) - (survivorExists ? parseFloat(offcutWeight || '0') : 0)).toFixed(2)
                                    : '0.00'}
                            </span> kg
                        </div>
                        <button
                            type="submit"
                            disabled={loading || !selectedItemId}
                            className="btn-primary flex items-center gap-2"
                        >
                            {loading ? <Loader2 className="animate-spin" /> : <><Scissors className="w-5 h-5" /> Process Cut</>}
                        </button>
                    </div>

                </form>
            </div>
        </div>
    );
}
