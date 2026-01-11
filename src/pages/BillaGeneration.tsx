import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2, CircleDot, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface Product {
    id: string;
    sku_name: string;
    required_raw_od: number;
    generated_billa_od: number;
    is_billa_viable: boolean;
}

interface RawItem {
    id: string;
    material_type_id: string;
    shape_data: { od?: number, length?: number, thickness?: number, type?: string };
    quantity_pieces: number;
    weight_per_piece: number;
    material_name?: string;
    material_types?: { name: string };
}

export default function BillaGeneration() {
    const [loading, setLoading] = useState(false);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // Data State
    const [rawCircles, setRawCircles] = useState<RawItem[]>([]);
    const [products, setProducts] = useState<Product[]>([]);

    // Selection
    const [selectedRawId, setSelectedRawId] = useState<string>('');
    const [selectedSkuId, setSelectedSkuId] = useState<string>('');
    const [qty, setQty] = useState<string>('');

    useEffect(() => {
        fetchData();
    }, []);

    async function fetchData() {
        // Fetch Raw Circles (We filter locally or by shape metadata if possible)
        // For now get all and filter by shape having 'od'
        const { data: rawData } = await supabase
            .from('inventory_raw')
            .select('*, material_types(name)')
            .gt('quantity_pieces', 0);

        if (rawData) {
            // Filter for items that look like circles (have OD) or material name contains "Circle"
            const circles = rawData
                .filter((i: RawItem) => i.shape_data?.od || i.material_types?.name?.includes('Circle') || i.shape_data?.type === 'Circle')
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .map((d: any) => ({ ...d, material_name: d.material_types?.name }));
            setRawCircles(circles);
        }

        // Fetch Products
        const { data: prodData } = await supabase.from('product_master').select('*');
        if (prodData) {
            setProducts(prodData);
        }
    }

    const handleSeedProducts = async () => {
        setLoading(true);
        // Seed some data
        await supabase.from('product_master').insert([
            { sku_name: 'Flange 100mm', required_raw_od: 150, generated_billa_od: 80, is_billa_viable: true },
            { sku_name: 'Flange 200mm', required_raw_od: 250, generated_billa_od: 180, is_billa_viable: true },
            { sku_name: 'Small Cap', required_raw_od: 50, generated_billa_od: 0, is_billa_viable: false },
        ]);
        fetchData();
        setLoading(false);
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setErrorMsg(null);
        setSuccessMsg(null);

        try {
            const rawItem = rawCircles.find(i => i.id === selectedRawId);
            const product = products.find(p => p.id === selectedSkuId);
            const processQty = parseInt(qty);

            if (!rawItem || !product || !processQty) throw new Error('Invalid Selection');
            if (processQty > rawItem.quantity_pieces) throw new Error('Insufficient Stock');

            // Logic:
            // 1. Deduct Raw Qty
            // 2. Add Finished Qty
            // 3. Handle Billa (Viable => Add Raw, Not Viable => Log Scrap)

            // 1. Deduct Raw
            const { error: deductErr } = await supabase
                .from('inventory_raw')
                .update({ quantity_pieces: rawItem.quantity_pieces - processQty })
                .eq('id', selectedRawId);
            if (deductErr) throw deductErr;

            // 2. Add Finished
            const { error: addFin } = await supabase
                .from('inventory_finished')
                .insert({
                    product_master_id: selectedSkuId,
                    quantity: processQty
                });
            if (addFin) throw addFin;

            // 3. Handle Billa
            // We need to calculate Weight of the Inner Circle (Billa) or Scrap Chips.
            // Assuming Steel Density.
            // Billa Weight = Volume * Density.
            // Vol = Pi * (OD/2)^2 * Thickness (Length of original raw item).
            // We assume the Billa has same thickness/length as raw item.

            const length = rawItem.shape_data?.length || rawItem.shape_data?.thickness || 10; // Fallback
            const billaOd = product.generated_billa_od;
            let billaWeightPerPiece = 0;

            if (billaOd > 0) {
                const r = billaOd / 2;
                const volMm3 = Math.PI * r * r * length;
                billaWeightPerPiece = volMm3 * 0.00000785;
            }

            if (product.is_billa_viable && billaOd > 0) {
                // Add to Inventory Raw as 'Billa'
                // Need to find 'Billet' or 'Circle' material type?
                // Let's reuse rawItem.material_type_id
                await supabase.from('inventory_raw').insert({
                    material_type_id: rawItem.material_type_id,
                    shape_data: { od: billaOd, length: length, type: 'Billa' },
                    weight_per_piece: billaWeightPerPiece,
                    quantity_pieces: processQty
                });
            } else {
                // Scrap (Melting Chips)
                // Weight is the volume of the ID hole.
                if (billaWeightPerPiece > 0) {
                    await supabase.from('scrap_log').insert({
                        scrap_type: 'Melting_Chips',
                        weight_kg: billaWeightPerPiece * processQty
                    });
                }
            }

            setSuccessMsg(`Processed ${processQty} units of ${product.sku_name}`);
            fetchData(); // Refresh

        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            setErrorMsg(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-3xl mx-auto">
            <div className="card">
                <div className="flex items-center gap-4 mb-6 pb-6 border-b border-industrial-border">
                    <div className="p-3 bg-industrial-accent/10 rounded-lg">
                        <CircleDot className="w-8 h-8 text-industrial-accent" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-white">Billa Generation (Co-Product)</h2>
                        <p className="text-industrial-muted text-sm">Machining & Tracking Offcuts</p>
                    </div>
                    {products.length === 0 && (
                        <button onClick={handleSeedProducts} className="ml-auto text-xs bg-industrial-border p-2 rounded">
                            Seed Test Products
                        </button>
                    )}
                </div>

                {successMsg && (
                    <div className="mb-6 p-4 bg-green-500/10 text-green-500 rounded-lg flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5" /> {successMsg}
                    </div>
                )}
                {errorMsg && (
                    <div className="mb-6 p-4 bg-red-500/10 text-red-500 rounded-lg flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5" /> {errorMsg}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-industrial-muted mb-2">Raw Material (Circle)</label>
                            <select
                                value={selectedRawId}
                                onChange={e => setSelectedRawId(e.target.value)}
                                className="input-field"
                                required
                            >
                                <option value="">-- Select Raw Circle --</option>
                                {rawCircles.map(r => (
                                    <option key={r.id} value={r.id}>
                                        {r.material_name} (OD: {r.shape_data?.od || 'N/A'}) - Qty: {r.quantity_pieces}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-industrial-muted mb-2">Target Product (SKU)</label>
                            <select
                                value={selectedSkuId}
                                onChange={e => setSelectedSkuId(e.target.value)}
                                className="input-field"
                                required
                            >
                                <option value="">-- Select Product --</option>
                                {products.map(p => (
                                    <option key={p.id} value={p.id}>
                                        {p.sku_name} (Billa: {p.is_billa_viable ? `Yes, ${p.generated_billa_od}mm` : 'No'})
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-industrial-muted mb-2">Quantity to Process</label>
                        <input
                            type="number"
                            value={qty}
                            onChange={e => setQty(e.target.value)}
                            className="input-field max-w-[200px]"
                            placeholder="e.g. 10"
                            required
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full btn-primary flex items-center justify-center gap-2"
                    >
                        {loading ? <Loader2 className="animate-spin" /> : 'Process Production'}
                    </button>
                </form>
            </div>
        </div>
    );
}
