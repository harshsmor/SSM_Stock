import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2, Settings, Save, X, CheckCircle2, AlertCircle } from 'lucide-react';

// Types
interface InventoryItem {
    id: string;
    material_type_id: string;
    shape_data: { od?: number; id?: number; thickness?: number; type?: string };
    weight_per_piece: number;
    quantity_pieces: number;
    material_name?: string;
    material_density?: number;
}

interface ProductMaster {
    id: string;
    sku_name: string;
    final_od: number;
    final_id: number;
    final_thickness: number;
    pcd: number;
    hole_count: number;
    hole_diameter: number;
}

export default function Processing() {
    // State
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    // Data Sources
    const [stockItems, setStockItems] = useState<InventoryItem[]>([]);
    const [products, setProducts] = useState<ProductMaster[]>([]);

    // Selections
    const [selectedStockIds, setSelectedStockIds] = useState<Set<string>>(new Set());
    const [selectedProductId, setSelectedProductId] = useState<string>('');

    // Inputs
    const [totalRequiredQty, setTotalRequiredQty] = useState<number>(1);
    const [allocationMap, setAllocationMap] = useState<Record<string, number>>({});

    // Derived / Locked Specs
    const [targetOD, setTargetOD] = useState<number>(0);
    const [targetID, setTargetID] = useState<number>(0);
    const [targetThk, setTargetThk] = useState<number>(0);
    const [holeCount, setHoleCount] = useState<number>(0);
    const [holeDia, setHoleDia] = useState<number>(0);

    // Modals
    const [showNewProductModal, setShowNewProductModal] = useState(false);
    const [editingProduct, setEditingProduct] = useState<ProductMaster | null>(null);

    useEffect(() => {
        fetchStock();
        fetchProducts();
    }, []);

    useEffect(() => {
        if (selectedProductId && products.length > 0) {
            const p = products.find(x => x.id === selectedProductId);
            if (p) {
                setTargetOD(p.final_od || 0);
                setTargetID(p.final_id || 0);
                setTargetThk(p.final_thickness || 0);
                setHoleCount(p.hole_count || 0);
                setHoleDia(p.hole_diameter || 0);
            }
        }
    }, [selectedProductId, products]);

    async function fetchStock() {
        const { data } = await supabase
            .from('inventory_raw')
            .select('*, material_types(name, density)')
            .gt('quantity_pieces', 0);

        if (data) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const items = data.map((d: any) => ({
                ...d,
                material_name: d.material_types?.name,
                material_density: d.material_types?.density
            }));
            const validItems = items.filter((i: InventoryItem) => {
                if (!i.shape_data?.od) return false;

                // If a product is selected, apply strict validity checks
                if (targetOD > 0) {
                    // 1. Raw OD must be >= Target OD (Can't make big thing from small thing)
                    if (i.shape_data.od < targetOD) return false;

                    // 2. Raw ID must be <= Target ID (Can't make small hole from big hole)
                    // (Assuming we are preserving the hole or boring it out)
                    // If Raw is Solid (ID=0), it's always valid (can drill any hole).
                    const rawID = i.shape_data.id || 0;
                    if (rawID > targetID) return false;

                    // 3. Thickness (Optional but good practice)
                    // We probably can't stretch thickness easily.
                    const rawThk = i.shape_data.thickness || 0;
                    if (rawThk < targetThk) return false;
                }
                return true;
            });
            setStockItems(validItems);
        }
    }

    async function fetchProducts() {
        const { data } = await supabase.from('product_master').select('*').order('sku_name');
        if (data) setProducts(data);
    }

    // Toggle Selection with "Smart" Default Allocation
    function toggleStockSelection(id: string) {
        const item = stockItems.find(i => i.id === id);
        if (!item) return;

        const nextIds = new Set(selectedStockIds);
        const nextAlloc = { ...allocationMap };

        if (nextIds.has(id)) {
            // Deselect
            nextIds.delete(id);
            delete nextAlloc[id];
        } else {
            // Select
            nextIds.add(id);
            // Smart Calc: Try to fill remaining required qty
            const currentAllocated = Object.values(allocationMap).reduce((a, b) => a + b, 0);
            const needed = Math.max(0, totalRequiredQty - currentAllocated);
            // Default to max available or needed
            nextAlloc[id] = Math.min(item.quantity_pieces, needed > 0 ? needed : item.quantity_pieces);
            // If needed is 0, we still default to ALL available? Or 0?
            // Usually if I click it, I want to use it.
            // Let's default to Math.min(item.quantity_pieces, needed > 0 ? needed : 1) for UX?
            // If I have 0 needed left, maybe I just want to add extra.
            if (needed === 0) nextAlloc[id] = 0;
            else nextAlloc[id] = Math.min(item.quantity_pieces, needed);
        }

        setSelectedStockIds(nextIds);
        setAllocationMap(nextAlloc);
    }

    // Manual Allocation Change with Waterfall update
    function handleAllocationChange(changedId: string, valStr: string) {
        const item = stockItems.find(i => i.id === changedId);
        if (!item) return;

        let val = parseInt(valStr);
        if (isNaN(val)) val = 0;

        // 1. Clamp the changed item
        const clampedVal = Math.min(Math.max(0, val), item.quantity_pieces);

        // 2. Prepare new map with this change
        const newMap = { ...allocationMap, [changedId]: clampedVal };

        // 3. Calculate "Gap" to fill TotalRequired
        // We exclude the item we just changed from the "filling" logic initially to see what the others hold
        // But simpler: Sum all, compare to Total.
        let currentSum = Object.values(newMap).reduce((a, b) => a + b, 0);
        let gap = totalRequiredQty - currentSum;

        // 4. Distribute Gap to OTHER selected items
        if (gap !== 0) {
            const otherIds = Array.from(selectedStockIds).filter(id => id !== changedId);

            for (const pid of otherIds) {
                if (gap === 0) break;

                const pItem = stockItems.find(i => i.id === pid);
                if (!pItem) continue;

                const currentPVal = newMap[pid] || 0;

                if (gap > 0) {
                    // Need to ADD
                    const canTake = pItem.quantity_pieces - currentPVal;
                    const take = Math.min(gap, canTake);
                    newMap[pid] = currentPVal + take;
                    gap -= take;
                } else {
                    // Need to SUBTRACT (gap is negative)
                    const canGiveBack = currentPVal;
                    const giveBack = Math.min(-gap, canGiveBack);
                    newMap[pid] = currentPVal - giveBack;
                    gap += giveBack;
                }
            }
        }

        setAllocationMap(newMap);
    }


    /* --- CALCULATIONS --- */
    const totalAllocatedQty = Object.values(allocationMap).reduce((a, b) => a + b, 0);

    const calcWeight = (od: number, id: number, thk: number, qty: number) => {
        if (od <= 0 || thk <= 0) return 0;
        const volMm3 = Math.PI * (Math.pow(od / 2, 2) - Math.pow(id / 2, 2)) * thk;
        return volMm3 * 0.00000785 * qty;
    };

    let totalInitialWt = 0;
    let totalExpectedBillaWt = 0;
    let totalExpectedRingWt = 0;

    Object.entries(allocationMap).forEach(([stockId, qty]) => {
        const item = stockItems.find(i => i.id === stockId);
        if (item) {
            totalInitialWt += (item.weight_per_piece * qty);

            const sourceOD = item.shape_data?.od || 0;
            const sourceID = item.shape_data?.id || 0;
            const sourceThk = item.shape_data?.thickness || targetThk;

            // Helper using sourceThk for Billa
            const calcBillaWeight = (od: number, id: number, thk: number, q: number) => {
                if (od <= id) return 0;
                const vol = Math.PI * (Math.pow(od / 2, 2) - Math.pow(id / 2, 2)) * thk;
                return vol * 0.00000785 * q;
            };

            // Billa Calc (Per Item)
            const billaOD = targetID - 2;
            if (billaOD > sourceID) {
                totalExpectedBillaWt += calcBillaWeight(billaOD, sourceID, sourceThk, qty);
            }

            // Ring Calc (Per Item)
            if (sourceOD >= (targetOD + 5)) {
                const ringID = targetOD + 2;
                // Ring from SourceOD down to RingID
                totalExpectedRingWt += calcWeight(sourceOD, ringID, targetThk, qty);
            }
        }
    });

    const singleButtonVol = Math.PI * Math.pow(holeDia / 2, 2) * targetThk;
    const totalButtonWt = (singleButtonVol * 0.00000785) * holeCount * totalAllocatedQty;

    // Finished Weight (Net) = Gross - Buttons
    const grossFinishedWt = calcWeight(targetOD, targetID, targetThk, totalAllocatedQty);
    const totalFinishedWt = Math.max(0, grossFinishedWt - totalButtonWt);

    // Fisher = Initial - (NetFinished + Billa + Ring + Buttons)
    //        = Initial - (GrossFinished + Billa + Ring)
    // Note: Buttons are subtracted from Gross to get Net, then added back as scrap. 
    // So mathematically they cancel out in "Total Material Used from Block", leaving 
    // the holes as "used by the finished part's bounding box".
    // Wait. Fisher is UNACCOUNTED material.
    // Initial covers everything.
    // We generated: NetFinished (Product), Billa (Scrap/Stock), Ring (Scrap), Buttons (Scrap).
    // Fisher = Initial - (NetFinished + Billa + Ring + Buttons).
    const totalWasteWt = Math.max(0, totalInitialWt - (totalFinishedWt + totalExpectedBillaWt + totalExpectedRingWt + totalButtonWt));


    async function handleSubmitProcess() {
        if (totalAllocatedQty <= 0) {
            setMsg({ type: 'error', text: 'No quantity allocated' });
            return;
        }

        setLoading(true);
        setMsg(null);

        try {

            // 1. Deduct Stock & Create Billas / Rings
            let recoverableBillaWt = 0;
            let recoverableRingWt = 0;

            for (const [stockId, qty] of Object.entries(allocationMap)) {
                if (qty > 0) {
                    const item = stockItems.find(i => i.id === stockId);
                    if (!item) continue;

                    // A. Deduct Source
                    const newQty = item.quantity_pieces - qty;
                    if (newQty === 0) {
                        await supabase.from('inventory_raw').delete().eq('id', stockId);
                    } else {
                        await supabase.from('inventory_raw').update({ quantity_pieces: newQty }).eq('id', stockId);
                    }

                    // B. Material Info
                    // B. Material Info
                    const sourceOD = item.shape_data.od || 0;
                    const sourceID = item.shape_data.id || 0;
                    const sourceThk = item.shape_data.thickness || targetThk;

                    // --- BILLA LOGIC (Inner Core) ---
                    // Billa OD = Target ID - 2mm (Kerf)
                    // Billa Thickness = Raw Thickness (Before facing)
                    const billaOD = targetID - 2;
                    if (billaOD > sourceID) {
                        const billaVol = Math.PI * (Math.pow(billaOD / 2, 2) - Math.pow(sourceID / 2, 2)) * sourceThk;
                        const singleBillaWt = billaVol * 0.00000785;
                        recoverableBillaWt += (singleBillaWt * qty);

                        // Fetch/Create 'Billa' Type
                        let billaTypeId = item.material_type_id;
                        const { data: billaType } = await supabase.from('material_types').select('id').ilike('name', 'Billa').single();
                        if (billaType) billaTypeId = billaType.id;
                        else {
                            const { data: newBilla } = await supabase.from('material_types').insert({ name: 'Billa', density: 7.85 }).select('id').single();
                            if (newBilla) billaTypeId = newBilla.id;
                        }

                        // Check for existing Billa with same dimensions (using sourceThk)
                        const { data: existingBilla } = await supabase
                            .from('inventory_raw')
                            .select('id, quantity_pieces, weight_per_piece')
                            .eq('material_type_id', billaTypeId)
                            .contains('shape_data', { od: billaOD, id: sourceID, thickness: sourceThk }) // JSON contains match
                            .maybeSingle();

                        if (existingBilla) {
                            // Update existing
                            await supabase.from('inventory_raw').update({
                                quantity_pieces: existingBilla.quantity_pieces + qty,
                                // Update weight just in case, though it should be same
                                weight_per_piece: singleBillaWt
                            }).eq('id', existingBilla.id);
                        } else {
                            // Insert Billa
                            await supabase.from('inventory_raw').insert({
                                material_type_id: billaTypeId,
                                quantity_pieces: qty,
                                weight_per_piece: singleBillaWt,
                                shape_data: { type: 'Circle', od: billaOD, id: sourceID, thickness: targetThk }
                            });
                        }
                    }

                    // --- RING LOGIC (Outer Shell) ---
                    // Condition: Source OD >= Target OD + 5mm
                    // Ring becomes SCRAP, not recoverable inventory
                    console.log(`🔍 Ring Check: sourceOD=${sourceOD}, targetOD=${targetOD}, need >= ${targetOD + 5}`);
                    if (sourceOD >= (targetOD + 5)) {
                        const ringID = targetOD + 2;
                        const ringVol = Math.PI * (Math.pow(sourceOD / 2, 2) - Math.pow(ringID / 2, 2)) * targetThk;
                        const singleRingWt = ringVol * 0.00000785;
                        recoverableRingWt += (singleRingWt * qty);
                    }
                }
            }

            // 2. Add Finished Goods
            const { data: existing } = await supabase.from('inventory_finished')
                .select('*')
                .eq('product_master_id', selectedProductId)
                .single();

            if (existing) {
                await supabase.from('inventory_finished').update({ quantity: existing.quantity + totalAllocatedQty }).eq('id', existing.id);
            } else {
                await supabase.from('inventory_finished').insert({ product_master_id: selectedProductId, quantity: totalAllocatedQty });
            }

            // 3. Log Scraps
            // Initial Weight = Solves Everything.
            // Fisher = Total Initial - (Finished + Billa_Recovered + Ring_Recovered + Buttons_Calcd).
            // Any "Kerf" from Billa/Ring cuts is part of Fisher.

            // Re-Calc Totals for accuracy
            const grossFinishedWt = calcWeight(targetOD, targetID, targetThk, totalAllocatedQty);
            const finalButtonWt = totalButtonWt;

            // Subtract buttons from finished weight
            const finalFinishedWt = Math.max(0, grossFinishedWt - finalButtonWt);

            // Fisher is the Rest
            // Total Used = NetFinished + Billa + Ring + Buttons
            const totalUsedWt = finalFinishedWt + recoverableBillaWt + recoverableRingWt + finalButtonWt;
            const fisherWt = Math.max(0, totalInitialWt - totalUsedWt);

            if (recoverableRingWt > 0) await supabase.from('scrap_log').insert({ scrap_type: 'Ring', weight_kg: recoverableRingWt });
            if (fisherWt > 0) await supabase.from('scrap_log').insert({ scrap_type: 'Fisher', weight_kg: fisherWt });
            if (finalButtonWt > 0) await supabase.from('scrap_log').insert({ scrap_type: 'Buttons', weight_kg: finalButtonWt });

            setMsg({ type: 'success', text: 'Process Completed Successfully' });
            setTotalRequiredQty(1);
            setSelectedStockIds(new Set());
            setAllocationMap({});
            fetchStock();

        } catch (err) {
            console.error(err);
            setMsg({ type: 'error', text: 'An error occurred during processing' });
        } finally {
            setLoading(false);
        }
    }

    async function handleSaveProduct(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const updates = Object.fromEntries(formData.entries());

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const payload: any = { sku_name: updates.sku_name };
        ['final_od', 'final_id', 'final_thickness', 'pcd', 'hole_count', 'hole_diameter'].forEach(k => {
            payload[k] = parseFloat(updates[k] as string);
        });

        if (editingProduct) {
            await supabase.from('product_master').update(payload).eq('id', editingProduct.id);
        } else {
            await supabase.from('product_master').insert(payload);
        }

        setShowNewProductModal(false);
        fetchProducts();
    }


    return (
        <div className="max-w-6xl mx-auto space-y-6">

            {/* HEADER */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-industrial-accent/10 rounded-lg">
                        <Settings className="w-8 h-8 text-industrial-accent" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-white">Production Line</h1>
                        <p className="text-industrial-muted">Convert Raw Stock to Finished Goods</p>
                    </div>
                </div>
                {msg && (
                    <div className={`px-4 py-2 rounded-lg border text-sm flex items-center gap-2 ${msg.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-500' : 'bg-red-500/10 border-red-500/20 text-red-500'
                        }`}>
                        {msg.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                        {msg.text}
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* LEFT COL: PRODUCT & STOCK */}
                <div className="lg:col-span-2 space-y-6">

                    {/* 1. Select Product */}
                    <div className="card">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-industrial-accent text-black text-xs">1</span>
                                Select Product
                            </h2>
                            <button onClick={() => { setEditingProduct(null); setShowNewProductModal(true); }} className="text-xs btn-secondary py-1.5 px-3">
                                + New SKU
                            </button>
                        </div>
                        <select
                            className="input-field text-lg mb-6"
                            value={selectedProductId}
                            onChange={e => setSelectedProductId(e.target.value)}
                        >
                            <option value="">-- Choose Target Product --</option>
                            {products.map(p => (
                                <option key={p.id} value={p.id}>{p.sku_name} (OD {p.final_od})</option>
                            ))}
                        </select>

                        {selectedProductId && (
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                                <div className="p-2 bg-industrial-bg rounded border border-industrial-border">
                                    <div className="text-[10px] text-industrial-muted">TARGET OD</div>
                                    <div className="text-lg font-bold text-white">{targetOD}</div>
                                </div>
                                <div className="p-2 bg-industrial-bg rounded border border-industrial-border">
                                    <div className="text-[10px] text-industrial-muted">ID</div>
                                    <div className="text-lg font-bold text-white">{targetID}</div>
                                </div>
                                <div className="p-2 bg-industrial-bg rounded border border-industrial-border">
                                    <div className="text-[10px] text-industrial-muted">THK</div>
                                    <div className="text-lg font-bold text-white">{targetThk}</div>
                                </div>
                                <div className="p-2 bg-industrial-bg rounded border border-industrial-border">
                                    <div className="text-[10px] text-industrial-muted">HOLES</div>
                                    <div className="text-lg font-bold text-white">{holeCount} <span className="text-[10px] font-normal">x{holeDia}</span></div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* 2. Select Stock */}
                    {selectedProductId && (
                        <div className="card">
                            <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
                                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-industrial-accent text-black text-xs">2</span>
                                Select Raw Material
                            </h2>
                            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                {stockItems.filter(i => (i.shape_data?.od || 0) >= targetOD).map(item => {
                                    const isSelected = selectedStockIds.has(item.id);
                                    const allocated = allocationMap[item.id] || 0;
                                    return (
                                        <div
                                            key={item.id}
                                            className={`
                                                relative p-4 rounded-xl border transition-all duration-200 group
                                                ${isSelected
                                                    ? 'bg-industrial-accent/10 border-industrial-accent shadow-lg'
                                                    : 'bg-industrial-bg border-industrial-border hover:border-industrial-accent/50'}
                                            `}
                                        >
                                            <div className="flex justify-between items-center sm:items-start">
                                                <div
                                                    className="cursor-pointer flex-1"
                                                    onClick={() => toggleStockSelection(item.id)}
                                                >
                                                    <div className="text-sm font-bold text-white">{item.material_name}</div>
                                                    <div className="flex gap-2 mt-1 flex-wrap">
                                                        <span className="badge bg-blue-500/10 text-blue-400 border-blue-500/20">OD {item.shape_data.od}</span>
                                                        <span className="badge bg-orange-500/10 text-orange-400 border-orange-500/20">THK {item.shape_data.thickness}</span>
                                                        {(item.shape_data.id || 0) > 0 && <span className="badge bg-purple-500/10 text-purple-400 border-purple-500/20">ID {item.shape_data.id}</span>}
                                                    </div>
                                                </div>

                                                <div className="flex flex-col items-end gap-2 text-right">
                                                    <div className="text-sm text-industrial-muted">Avail: <b className="text-white">{item.quantity_pieces}</b></div>

                                                    {isSelected ? (
                                                        <div className="flex items-center gap-2 animate-in fade-in">
                                                            <span className="text-xs text-industrial-accent font-bold">Use:</span>
                                                            <input
                                                                type="number"
                                                                className="w-20 bg-industrial-bg border border-industrial-accent rounded px-2 py-1 text-right text-white font-bold focus:outline-none focus:ring-1 focus:ring-industrial-accent"
                                                                value={allocated} // Show 0 if undefined? No, default was set in toggle
                                                                onClick={e => e.stopPropagation()}
                                                                onChange={e => handleAllocationChange(item.id, e.target.value)}
                                                            />
                                                        </div>
                                                    ) : (
                                                        <button
                                                            onClick={() => toggleStockSelection(item.id)}
                                                            className="text-xs btn-secondary py-1 px-3 border border-industrial-border"
                                                        >
                                                            Select
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                                {stockItems.filter(i => (i.shape_data?.od || 0) >= targetOD).length === 0 && (
                                    <div className="text-center py-6 text-industrial-muted border-2 border-dashed border-industrial-border rounded-xl">
                                        No compatible stock found (OD must be &ge; {targetOD})
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* RIGHT COL: SUMMARY & ACTIONS */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="card sticky top-6 bg-industrial-bg/50 backdrop-blur-sm border-industrial-accent/20">
                        <h2 className="text-lg font-bold text-white mb-6">Production Plan</h2>

                        <div className="space-y-6">
                            <div>
                                <label className="block text-xs font-bold text-industrial-muted uppercase tracking-wider mb-2">Required Quantity</label>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="number"
                                        min={1}
                                        className="input-field text-center text-2xl font-bold h-14"
                                        value={totalRequiredQty}
                                        onChange={e => setTotalRequiredQty(Math.max(1, parseInt(e.target.value) || 0))}
                                    />
                                </div>
                            </div>

                            <div className="p-4 rounded-xl bg-industrial-surface border border-industrial-border space-y-3">
                                <div className="flex justify-between">
                                    <span className="text-industrial-muted">Allocated</span>
                                    <span className={`font-bold ${totalAllocatedQty >= totalRequiredQty ? 'text-green-500' : 'text-orange-500'}`}>
                                        {totalAllocatedQty} / {totalRequiredQty}
                                    </span>
                                </div>
                                <div className="w-full bg-industrial-bg h-2 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full transition-all duration-500 ${totalAllocatedQty >= totalRequiredQty ? 'bg-green-500' : 'bg-orange-500'}`}
                                        style={{ width: `${Math.min(100, (totalAllocatedQty / totalRequiredQty) * 100)}%` }}
                                    ></div>
                                </div>
                            </div>

                            {totalAllocatedQty > 0 && (
                                <div className="space-y-2 pt-4 border-t border-industrial-border/50 text-sm">
                                    <div className="flex justify-between items-center text-sm py-1">
                                        <span className="text-industrial-muted">Est. Finished Wt</span>
                                        <span className="text-white font-mono">{totalFinishedWt.toFixed(4)} kg</span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm py-1">
                                        <span className="text-industrial-muted">Est. Scrap Gen</span>
                                        <span className="text-red-400 font-mono">{(totalWasteWt + totalExpectedBillaWt + totalExpectedRingWt + totalButtonWt).toFixed(4)} kg</span>
                                    </div>
                                </div>
                            )}

                            <button
                                onClick={handleSubmitProcess}
                                disabled={loading || totalAllocatedQty === 0}
                                className="w-full btn-primary h-14 mt-4 flex items-center justify-center gap-2 shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all disabled:opacity-50 disabled:hover:scale-100"
                            >
                                {loading ? <Loader2 className="animate-spin" /> : <><Save className="w-5 h-5" /> Confirm Process</>}
                            </button>
                        </div>
                    </div>
                </div>

            </div>

            {/* NEW PRODUCT MODAL */}
            {showNewProductModal && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
                    <div className="card w-full max-w-lg relative animate-in zoom-in-95">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xl font-bold text-white">
                                {editingProduct ? 'Edit Finished Item' : 'Add New Finished Item'}
                            </h3>
                            <button onClick={() => setShowNewProductModal(false)} className="text-industrial-muted hover:text-white">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleSaveProduct} className="space-y-4">
                            <div>
                                <label className="block text-xs text-industrial-muted mb-1">Item Name</label>
                                <input
                                    name="sku_name" required className="input-field"
                                    placeholder='e.g. "4" Table E"'
                                    defaultValue={editingProduct?.sku_name}
                                />
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                                <div>
                                    <label className="block text-xs text-industrial-muted mb-1">OD (mm)</label>
                                    <input name="final_od" type="number" step="0.1" required className="input-field" defaultValue={editingProduct?.final_od} />
                                </div>
                                <div>
                                    <label className="block text-xs text-industrial-muted mb-1">ID (mm)</label>
                                    <input name="final_id" type="number" step="0.1" required className="input-field" defaultValue={editingProduct?.final_id} />
                                </div>
                                <div>
                                    <label className="block text-xs text-industrial-muted mb-1">Thk (mm)</label>
                                    <input name="final_thickness" type="number" step="0.1" required className="input-field" defaultValue={editingProduct?.final_thickness} />
                                </div>
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                                <div>
                                    <label className="block text-xs text-industrial-muted mb-1">PCD (mm)</label>
                                    <input name="pcd" type="number" step="0.1" required className="input-field" defaultValue={editingProduct?.pcd} />
                                </div>
                                <div>
                                    <label className="block text-xs text-industrial-muted mb-1">Holes</label>
                                    <input name="hole_count" type="number" required className="input-field" defaultValue={editingProduct?.hole_count} />
                                </div>
                                <div>
                                    <label className="block text-xs text-industrial-muted mb-1">Hole Dia</label>
                                    <input name="hole_diameter" type="number" step="0.1" required className="input-field" defaultValue={editingProduct?.hole_diameter} />
                                </div>
                            </div>
                            <div className="flex gap-3 mt-6">
                                <button type="button" onClick={() => setShowNewProductModal(false)} className="flex-1 btn-secondary">Cancel</button>
                                <button type="submit" className="flex-1 btn-primary">
                                    {editingProduct ? 'Update Item' : 'Create Item'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
