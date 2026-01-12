import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2, Package, ShoppingCart, Search, X } from 'lucide-react';

interface RawItem {
    id: string;
    material_types: { name: string };
    shape_data: { type?: string; od?: number; length?: number; width?: number; thickness?: number; id?: number };
    quantity_pieces: number;
    weight_per_piece: number;
    created_at: string;
}

interface FinishedItem {
    id: string;
    product_master: { sku_name: string; final_od: number; final_id: number; hole_count: number };
    quantity: number;
    updated_at: string;
}

interface ScrapItem {
    type: string;
    weight: number;
}

interface CartItem {
    id: string; // unique ID for cart key
    inventoryId: string; // DB ID
    type: 'raw' | 'finished' | 'scrap';
    name: string;
    details: string;
    sellQty: number;      // Pieces (for raw/finished) or Kg (for scrap)
    sellWeight?: number;  // Calculated weight for raw/finished
    originalItem: InventoryItem;
}

type InventoryItem = RawItem | FinishedItem | ScrapItem;

export default function Inventory() {
    const [activeTab, setActiveTab] = useState<'raw' | 'finished' | 'scrap'>('raw');
    const [loading, setLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    // Data
    const [rawData, setRawData] = useState<RawItem[]>([]);
    const [finishedData, setFinishedData] = useState<FinishedItem[]>([]);
    const [scrapData, setScrapData] = useState<ScrapItem[]>([]);

    // Sales Modal
    const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
    const [sellQty, setSellQty] = useState('');
    const [sellWeight, setSellWeight] = useState('');
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // Cart
    const [cart, setCart] = useState<CartItem[]>([]);
    const [showCart, setShowCart] = useState(false);

    const handleDirectAddToCart = (item: InventoryItem) => {
        // QUICK ADD: Add FULL available quantity
        let qty = 1;

        if (activeTab === 'raw') {
            qty = (item as RawItem).quantity_pieces;
        } else if (activeTab === 'finished') {
            qty = (item as FinishedItem).quantity;
        } else {
            // Scrap uses weight
            // For scrap 'qty' logic is handled differently in cart construction (it uses 'sellWeight' usually)
            // But let's set qty to 1 for scrap structure generally, or if using weight as quantity...
            // Wait, scrap logic below uses 'sellQty' as weight for scrap?
            // Looking at lines 152 in original: sellQty: 1, sellWeight: 1.
            // Let's defer scrap decision to the block below to be safe.
            // Actually, the user said "Material... fully added".
            // For scrap, 'full' means full weight.
        }

        let cartItem: CartItem;

        // 1. Construct Cart Item
        if (activeTab === 'raw') {
            const ri = item as RawItem;
            // Check stock
            if (ri.quantity_pieces < 1) { setErrorMsg("Out of stock"); return; } // Should use toast

            const sd = ri.shape_data || {};
            const details = [
                sd.od ? `OD ${sd.od}` : '',
                sd.id ? `ID ${sd.id}` : '',
                sd.thickness ? `THK ${sd.thickness}` : '',
                sd.length ? `L ${sd.length}` : '',
                sd.width ? `W ${sd.width}` : ''
            ].filter(Boolean).join(' | ');

            cartItem = {
                id: `raw-${ri.id}`,
                inventoryId: ri.id,
                type: 'raw',
                name: ri.material_types.name,
                details: details || 'Raw Material',
                sellQty: qty,
                sellWeight: ri.weight_per_piece * qty,
                originalItem: ri
            };
        } else if (activeTab === 'finished') {
            const fi = item as FinishedItem;
            if (fi.quantity < 1) { return; }

            const pm = fi.product_master;
            const details = [
                `OD ${pm.final_od}`,
                pm.final_id ? `ID ${pm.final_id}` : '',
                pm.hole_count ? `${pm.hole_count} Holes` : ''
            ].filter(Boolean).join(' | ');

            cartItem = {
                id: `fin-${fi.id}`,
                inventoryId: fi.id,
                type: 'finished',
                name: fi.product_master.sku_name,
                details: details,
                sellQty: qty,
                sellWeight: 0,
                originalItem: fi
            };
        } else {
            // Scrap - default FULL weight
            const si = item as ScrapItem;
            cartItem = {
                id: `scrap-${si.type}`,
                inventoryId: si.type,
                type: 'scrap',
                name: si.type.replace(/_/g, ' '),
                details: 'Scrap',
                sellQty: si.weight, // Full available weight
                sellWeight: si.weight, // Full available weight
                originalItem: si
            };
        }

        setCart(prev => {
            const existing = prev.find(i => i.id === cartItem.id);
            if (existing) {
                // Increment
                return prev.map(i => i.id === cartItem.id ? { ...i, sellQty: i.sellQty + 1, sellWeight: (i.sellWeight || 0) + (cartItem.sellWeight || 0) } : i);
            }
            return [...prev, cartItem];
        });

        // Visual Feedback (Pulse or Toast?)
        // For now, just relying on the cart counter incrementing
    };

    const addToCart = () => {
        if (!selectedItem) return;

        let cartItem: CartItem;
        const qty = parseFloat(sellQty) || 0;
        const wt = parseFloat(sellWeight) || 0;

        // Validation
        if (activeTab === 'scrap') {
            if (wt <= 0) { setErrorMsg("Weight is required"); return; }
        } else {
            if (qty <= 0) { setErrorMsg("Quantity is required"); return; }
        }

        if (activeTab === 'raw') {
            const ri = selectedItem as RawItem;
            if (qty > ri.quantity_pieces) { setErrorMsg("Exceeds stock"); return; }

            const sd = ri.shape_data || {};
            const details = [
                sd.od ? `OD ${sd.od}` : '',
                sd.id ? `ID ${sd.id}` : '',
                sd.thickness ? `THK ${sd.thickness}` : '',
                sd.length ? `L ${sd.length}` : '',
                sd.width ? `W ${sd.width}` : ''
            ].filter(Boolean).join(' | ');

            cartItem = {
                id: `raw-${ri.id}`,
                inventoryId: ri.id,
                type: 'raw',
                name: ri.material_types.name,
                details: details || 'Raw Material',
                sellQty: qty,
                sellWeight: ri.weight_per_piece * qty,
                originalItem: ri
            };
        } else if (activeTab === 'finished') {
            const fi = selectedItem as FinishedItem;
            if (qty > fi.quantity) { setErrorMsg("Exceeds stock"); return; }

            const pm = fi.product_master;
            const details = [
                `OD ${pm.final_od}`,
                pm.final_id ? `ID ${pm.final_id}` : '',
                pm.hole_count ? `${pm.hole_count} Holes` : ''
            ].filter(Boolean).join(' | ');

            cartItem = {
                id: `fin-${fi.id}`,
                inventoryId: fi.id,
                type: 'finished',
                name: fi.product_master.sku_name,
                details: details,
                sellQty: qty,
                sellWeight: 0,
                originalItem: fi
            };
        } else {
            const si = selectedItem as ScrapItem;
            cartItem = {
                id: `scrap-${si.type}`,
                inventoryId: si.type,
                type: 'scrap',
                name: si.type.replace(/_/g, ' '),
                details: 'Scrap',
                sellQty: wt,
                sellWeight: wt,
                originalItem: si
            };
        }

        setCart(prev => {
            const existing = prev.find(i => i.id === cartItem.id);
            if (existing) {
                return prev.map(i => i.id === cartItem.id ? { ...i, sellQty: i.sellQty + cartItem.sellQty, sellWeight: (i.sellWeight || 0) + (cartItem.sellWeight || 0) } : i);
            }
            return [...prev, cartItem];
        });

        setSelectedItem(null);
        setSellQty('');
        setSellWeight('');
        setErrorMsg(null);
    };

    const updateCartQty = (id: string, newQty: number) => {
        if (newQty < 1) return;
        setCart(prev => prev.map(item => {
            if (item.id === id) {
                // Recalculate weight for raw items
                const unitWeight = item.type === 'raw' ? (item.originalItem as RawItem).weight_per_piece : 0;
                return { ...item, sellQty: newQty, sellWeight: unitWeight * newQty };
            }
            return item;
        }));
    };

    const handleBulkCheckout = async () => {
        setLoading(true);
        try {
            for (const item of cart) {
                // Process each item (Same logic as single sell)
                if (item.type === 'raw') {
                    const ri = item.originalItem as RawItem;
                    // Verify stock again? For now assume valid
                    const { data: fresh } = await supabase.from('inventory_raw').select('quantity_pieces').eq('id', ri.id).single();
                    if (!fresh || fresh.quantity_pieces < item.sellQty) throw new Error(`Stock changed for ${item.name}`);

                    const newQty = fresh.quantity_pieces - item.sellQty;
                    if (newQty === 0) await supabase.from('inventory_raw').delete().eq('id', ri.id);
                    else await supabase.from('inventory_raw').update({ quantity_pieces: newQty }).eq('id', ri.id);

                    // Log Sale
                    await supabase.from('sales_log').insert({
                        item_name: `${item.name} (${item.details})`,
                        quantity: item.sellQty,
                        total_weight_kg: item.sellWeight || 0,
                        sale_type: 'Raw Material'
                    });

                } else if (item.type === 'finished') {
                    const fi = item.originalItem as FinishedItem;
                    const { data: fresh } = await supabase.from('inventory_finished').select('quantity').eq('id', fi.id).single();
                    if (!fresh || fresh.quantity < item.sellQty) throw new Error(`Stock changed for ${item.name}`);

                    const newQty = fresh.quantity - item.sellQty;
                    if (newQty === 0) await supabase.from('inventory_finished').delete().eq('id', fi.id);
                    else await supabase.from('inventory_finished').update({ quantity: newQty }).eq('id', fi.id);

                    // Log Sale
                    await supabase.from('sales_log').insert({
                        item_name: `${item.name} (${item.details})`,
                        quantity: item.sellQty,
                        sale_type: 'Finished Good'
                    });

                } else {
                    // Scrap
                    await supabase.from('scrap_log').insert({
                        scrap_type: item.inventoryId,
                        weight_kg: -item.sellQty // Negative to show deduction? Or just log "Sale"? 
                        // Actually, wait. scrap_log tracks generation (+). 
                        // If we sell scrap, we should arguably log it as a negative entry in scrap_log (to reduce stock)
                        // AND a positive entry in sales_log.
                    });
                    // Log Sale
                    await supabase.from('sales_log').insert({
                        item_name: `${item.name} Scrap`,
                        quantity: 1, // 1 Lot?
                        total_weight_kg: item.sellQty,
                        sale_type: 'Scrap'
                    });
                }
            }

            setCart([]);
            setShowCart(false);
            fetchData();
            alert('Bulk Sale Completed Successfully!');

        } catch (err: any) {
            console.error(err);
            alert(`Checkout Failed: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    const removeFromCart = (id: string) => {
        setCart(prev => prev.filter(i => i.id !== id));
    };

    useEffect(() => {
        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab]);

    async function fetchData() {
        setLoading(true);
        if (activeTab === 'raw') {
            const { data } = await supabase.from('inventory_raw')
                .select('*, material_types(name)')
                .gt('quantity_pieces', 0)
                .order('created_at', { ascending: false });
            setRawData(data || []);
        } else if (activeTab === 'finished') {
            const { data } = await supabase.from('inventory_finished')
                .select('*, product_master(*)')
                .gt('quantity', 0);
            setFinishedData(data || []);
        } else {
            // Aggregate Scrap based on type
            const { data } = await supabase.from('scrap_log').select('*');
            if (data) {
                const aggregated: Record<string, number> = {};
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                data.forEach((d: any) => {
                    aggregated[d.scrap_type] = (aggregated[d.scrap_type] || 0) + d.weight_kg;
                });
                setScrapData(Object.entries(aggregated).map(([k, v]) => ({ type: k, weight: v })));
            }
        }
        setLoading(false);
    }

    // Filter Logic
    const filteredRaw = useMemo(() => {
        if (!searchQuery) return rawData;
        const q = searchQuery.toLowerCase();
        return rawData.filter(i =>
            i.material_types.name.toLowerCase().includes(q) ||
            (i.shape_data?.id?.toString() || '').includes(q) ||
            (i.shape_data?.od?.toString() || '').includes(q)
        );
    }, [rawData, searchQuery]);

    const filteredFinished = useMemo(() => {
        if (!searchQuery) return finishedData;
        const q = searchQuery.toLowerCase();
        return finishedData.filter(i => i.product_master.sku_name.toLowerCase().includes(q));
    }, [finishedData, searchQuery]);

    const filteredScrap = useMemo(() => {
        if (!searchQuery) return scrapData;
        const q = searchQuery.toLowerCase();
        return scrapData.filter(i => i.type.replace(/_/g, ' ').toLowerCase().includes(q));
    }, [scrapData, searchQuery]);

    // Summary Stats
    const summaryStats = useMemo(() => {
        if (activeTab === 'raw') {
            const count = filteredRaw.length;
            const totalKg = filteredRaw.reduce((sum, i) => sum + (i.quantity_pieces * i.weight_per_piece), 0);
            return { count, totalKg };
        } else if (activeTab === 'finished') {
            const count = filteredFinished.length; // Distinct Items
            const totalPcs = filteredFinished.reduce((sum, i) => sum + i.quantity, 0);
            return { count, totalPcs };
        } else {
            const totalKg = filteredScrap.reduce((sum, i) => sum + i.weight, 0);
            return { totalKg };
        }
    }, [activeTab, filteredRaw, filteredFinished, filteredScrap]);


    // Pre-fill Modal with Max Quantity
    useEffect(() => {
        if (selectedItem) {
            if (activeTab === 'raw') {
                setSellQty((selectedItem as RawItem).quantity_pieces.toString());
                setSellWeight(((selectedItem as RawItem).quantity_pieces * (selectedItem as RawItem).weight_per_piece).toFixed(2));
            } else if (activeTab === 'finished') {
                setSellQty((selectedItem as FinishedItem).quantity.toString());
            } else {
                setSellWeight((selectedItem as ScrapItem).weight.toFixed(2));
            }
        }
    }, [selectedItem, activeTab]);

    async function handleSell() {
        if (!selectedItem) return;
        const qty = parseFloat(sellQty) || 0;
        const wt = parseFloat(sellWeight) || 0;

        if (qty <= 0 && wt <= 0) {
            setErrorMsg("Please enter a valid Quantity or Weight");
            return;
        }

        setLoading(true);
        setErrorMsg(null);

        try {
            // Prepare Log Name
            let itemName = '';
            if (activeTab === 'raw') {
                const ri = selectedItem as RawItem;
                itemName = `${ri.material_types?.name} ${ri.shape_data?.type || ''}`;
            } else if (activeTab === 'finished') {
                itemName = (selectedItem as FinishedItem).product_master?.sku_name;
            } else {
                itemName = (selectedItem as ScrapItem).type;
            }

            // 1. Log Sale
            const log = {
                category: activeTab === 'raw' ? 'Raw' : activeTab === 'finished' ? 'Finished' : 'Scrap',
                item_name: itemName,
                quantity: qty,
                weight_kg: wt
            };
            await supabase.from('sales_log').insert(log);

            // 2. Decrement Stock
            if (activeTab === 'raw') {
                const ri = selectedItem as RawItem;
                const newQty = ri.quantity_pieces - qty;
                if (newQty < 0) throw new Error("Sale quantity exceeds available stock");
                if (newQty === 0) {
                    await supabase.from('inventory_raw').delete().eq('id', ri.id);
                } else {
                    await supabase.from('inventory_raw').update({ quantity_pieces: newQty }).eq('id', ri.id);
                }
            } else if (activeTab === 'finished') {
                const fi = selectedItem as FinishedItem;
                const newQty = fi.quantity - qty;
                if (newQty < 0) throw new Error("Sale quantity exceeds available stock");
                if (newQty === 0) {
                    await supabase.from('inventory_finished').delete().eq('id', fi.id);
                } else {
                    await supabase.from('inventory_finished').update({ quantity: newQty }).eq('id', fi.id);
                }
            } else {
                // Scrap
                const si = selectedItem as ScrapItem;
                await supabase.from('scrap_log').insert({
                    scrap_type: si.type,
                    weight_kg: -wt
                });
            }

            setSelectedItem(null);
            setSellQty('');
            setSellWeight('');
            fetchData();

        } catch (err) {
            console.error(err);
            const msg = err instanceof Error ? err.message : 'Failed to sell items';
            setErrorMsg(msg);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="max-w-6xl mx-auto space-y-6">

            {/* Header & Controls */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-industrial-accent/10 rounded-lg">
                        <Package className="w-8 h-8 text-industrial-accent" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-white">Stock Inventory</h1>
                        <p className="text-industrial-muted">Manage available stock</p>
                    </div>
                </div>

                {/* Search Bar */}
                <div className="relative w-full md:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-industrial-muted" />
                    <input
                        type="text"
                        placeholder="Search items..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-8 py-2 bg-industrial-surface border border-industrial-border rounded-lg text-sm text-white focus:border-industrial-accent focus:outline-none transition-colors"
                    />
                    {searchQuery && (
                        <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-industrial-muted hover:text-white">
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>

            {/* Tabs & Summary */}
            <div className="flex flex-col md:flex-row justify-between items-end border-b border-industrial-border gap-4">
                <div className="flex gap-4 w-full md:w-auto overflow-x-auto">
                    {(['raw', 'finished', 'scrap'] as const).map(tab => (
                        <button
                            key={tab}
                            onClick={() => { setActiveTab(tab); setSearchQuery(''); }}
                            className={`pb-3 px-4 text-sm font-medium capitalize transition-colors whitespace-nowrap ${activeTab === tab
                                ? 'text-industrial-accent border-b-2 border-industrial-accent'
                                : 'text-industrial-muted hover:text-white'
                                }`}
                        >
                            {tab} Stock
                        </button>
                    ))}
                </div>

                {/* Active Tab Stats */}
                <div className="flex items-center gap-4 pb-2 px-2 text-xs font-mono text-industrial-muted">
                    {activeTab === 'raw' && (
                        <>
                            <span>Items: <b className="text-white">{summaryStats.count}</b></span>
                            <span className="w-px h-4 bg-industrial-border"></span>
                            <span>Total Wt: <b className="text-industrial-accent">{summaryStats.totalKg?.toFixed(1)} kg</b></span>
                        </>
                    )}
                    {activeTab === 'finished' && (
                        <>
                            <span>SKUs: <b className="text-white">{summaryStats.count}</b></span>
                            <span className="w-px h-4 bg-industrial-border"></span>
                            <span>Total Pcs: <b className="text-green-500">{summaryStats.totalPcs}</b></span>
                        </>
                    )}
                    {activeTab === 'scrap' && (
                        <span>Total Scrap: <b className="text-red-500">{summaryStats.totalKg?.toFixed(1)} kg</b></span>
                    )}
                </div>
            </div>

            {/* Content */}
            {loading ? (
                <div className="flex justify-center py-12"><Loader2 className="animate-spin text-industrial-accent" /></div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* RAW STOCK */}
                    {activeTab === 'raw' && filteredRaw.map(item => (
                        <div
                            key={item.id}
                            onClick={() => { setSelectedItem(item); setErrorMsg(null); }}
                            className="card p-5 hover:border-industrial-accent/50 transition-all duration-300 hover:shadow-lg hover:bg-industrial-surface/80 group cursor-pointer relative overflow-hidden"
                        >
                            {/* Hover Gradient Effect */}
                            <div className="absolute inset-0 bg-gradient-to-br from-industrial-accent/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                            <div className="relative z-10">
                                <div className="flex justify-between items-start mb-4">
                                    <div>
                                        <h3 className="font-bold text-white text-lg group-hover:text-industrial-accent transition-colors">{item.material_types?.name}</h3>
                                        <div className="flex gap-2 mt-1">
                                            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-industrial-bg text-industrial-muted uppercase tracking-wider border border-industrial-border">
                                                {item.shape_data?.type}
                                            </span>

                                        </div>
                                    </div>
                                    <div
                                        onClick={(e) => { e.stopPropagation(); handleDirectAddToCart(item); }}
                                        className="p-2 rounded-lg bg-industrial-bg border border-industrial-border group-hover:border-red-500/50 transition-colors group-hover:bg-red-500/20 active:scale-95"
                                    >
                                        <ShoppingCart className="w-5 h-5 text-industrial-muted group-hover:text-red-400" />
                                    </div>
                                </div>

                                {/* Dimensions Row - Consistent for ALL items */}
                                <div className="flex flex-wrap gap-2 mb-4">
                                    {/* OD - Always Blue */}
                                    {item.shape_data?.od && (
                                        <span className="badge bg-blue-500/10 text-blue-400 border-blue-500/20 px-2 py-0.5 rounded text-xs font-bold border">
                                            OD {item.shape_data.od}
                                        </span>
                                    )}

                                    {/* ID - Always Purple (Even if 0/Solid for consistency? Or only if >0?) */}
                                    {/* User asked for consistent design. Usually ID 0 implies solid. */}
                                    {/* If ID exists in data, show it. */}
                                    {(item.shape_data?.id !== undefined) && (
                                        <span className="badge bg-purple-500/10 text-purple-400 border-purple-500/20 px-2 py-0.5 rounded text-xs font-bold border">
                                            ID {item.shape_data.id}
                                        </span>
                                    )}

                                    {/* Thickness - Always Orange */}
                                    {item.shape_data?.thickness && (
                                        <span className="badge bg-orange-500/10 text-orange-400 border-orange-500/20 px-2 py-0.5 rounded text-xs font-bold border">
                                            THK {item.shape_data.thickness}
                                        </span>
                                    )}

                                    {/* Fallbacks for Rectangles (Length/Width) */}
                                    {item.shape_data?.length && <span className="badge bg-industrial-bg text-industrial-muted border-industrial-border px-2 py-0.5 rounded text-xs border">L: {item.shape_data.length}</span>}
                                    {item.shape_data?.width && <span className="badge bg-industrial-bg text-industrial-muted border-industrial-border px-2 py-0.5 rounded text-xs border">W: {item.shape_data.width}</span>}
                                </div>

                                <div className="flex items-baseline gap-2">
                                    <span className="text-4xl font-bold text-white tracking-tight">{item.quantity_pieces}</span>
                                    <span className="text-industrial-muted font-medium">pcs</span>
                                </div>
                                <div className="text-xs text-industrial-muted mt-1 font-mono">
                                    Total Weight: ~{Math.round(item.quantity_pieces * item.weight_per_piece).toLocaleString()} kg
                                </div>
                            </div>
                        </div>
                    ))}

                    {/* FINISHED STOCK */}
                    {activeTab === 'finished' && filteredFinished.map(item => (
                        <div
                            key={item.id}
                            onClick={() => { setSelectedItem(item); setErrorMsg(null); }}
                            className="card p-5 hover:border-green-500/50 transition-all duration-300 hover:shadow-lg hover:bg-industrial-surface/80 group cursor-pointer relative overflow-hidden"
                        >
                            <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                            <div className="relative z-10">
                                <div className="flex justify-between items-start mb-4">
                                    <div>
                                        <h3 className="font-bold text-white text-lg group-hover:text-green-400 transition-colors">{item.product_master?.sku_name}</h3>
                                        <div className="flex gap-2 mt-1">
                                            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-green-500/10 text-green-400 uppercase tracking-wider border border-green-500/20">
                                                Finished
                                            </span>
                                        </div>
                                    </div>
                                    <div
                                        onClick={(e) => { e.stopPropagation(); handleDirectAddToCart(item); }}
                                        className="p-2 rounded-lg bg-industrial-bg border border-industrial-border group-hover:border-green-500/50 transition-colors active:scale-95 group-hover:bg-green-500/10"
                                    >
                                        <ShoppingCart className="w-5 h-5 text-industrial-muted group-hover:text-white" />
                                    </div>
                                </div>

                                {/* Product Details - Consistent Badge Design */}
                                <div className="flex flex-wrap gap-2 mb-4">
                                    {item.product_master?.final_od && (
                                        <span className="badge bg-blue-500/10 text-blue-400 border-blue-500/20 px-2 py-0.5 rounded text-xs font-bold border">
                                            OD {item.product_master.final_od}
                                        </span>
                                    )}

                                    {((item.product_master as any)?.final_id !== undefined) && (
                                        <span className="badge bg-purple-500/10 text-purple-400 border-purple-500/20 px-2 py-0.5 rounded text-xs font-bold border">
                                            ID {(item.product_master as any).final_id}
                                        </span>
                                    )}

                                    {(item.product_master as any)?.final_thickness && (
                                        <span className="badge bg-orange-500/10 text-orange-400 border-orange-500/20 px-2 py-0.5 rounded text-xs font-bold border">
                                            THK {(item.product_master as any).final_thickness}
                                        </span>
                                    )}

                                    {((item.product_master as any)?.hole_count && (item.product_master as any).hole_count > 0) && (
                                        <span className="badge bg-yellow-500/10 text-yellow-400 border-yellow-500/20 px-2 py-0.5 rounded text-xs font-bold border">
                                            {(item.product_master as any).hole_count}x ⌀{(item.product_master as any).hole_diameter}
                                        </span>
                                    )}
                                </div>

                                <div className="flex items-baseline gap-2">
                                    <span className="text-4xl font-bold text-white tracking-tight">{item.quantity}</span>
                                    <span className="text-industrial-muted font-medium">pcs</span>
                                </div>
                            </div>
                        </div>
                    ))}

                    {/* SCRAP STOCK */}
                    {activeTab === 'scrap' && filteredScrap.map(item => (
                        <div
                            key={item.type}
                            onClick={() => { setSelectedItem(item); setErrorMsg(null); }}
                            className="card p-5 hover:border-red-500/50 transition-all duration-300 hover:shadow-lg hover:bg-industrial-surface/80 group cursor-pointer relative overflow-hidden"
                        >
                            <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                            <div className="relative z-10">
                                <div className="flex justify-between items-start mb-6">
                                    <h3 className="font-bold text-white text-lg capitalize flex items-center gap-3">
                                        <div className="w-3 h-3 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]"></div>
                                        {item.type.replace(/_/g, ' ')}
                                    </h3>
                                    <div
                                        onClick={(e) => { e.stopPropagation(); handleDirectAddToCart(item); }}
                                        className="p-2 rounded-lg bg-industrial-bg border border-industrial-border group-hover:border-red-500/50 transition-colors group-hover:bg-red-500/20 active:scale-95"
                                    >
                                        <ShoppingCart className="w-5 h-5 text-industrial-muted group-hover:text-red-400" />
                                    </div>
                                </div>

                                <div className="flex items-baseline gap-2">
                                    <span className="text-4xl font-bold text-white tracking-tight">{item.weight.toFixed(1)}</span>
                                    <span className="text-industrial-muted font-medium">kg</span>
                                </div>
                            </div>
                        </div>
                    ))}

                    {!loading && ((activeTab === 'raw' && filteredRaw.length === 0) || (activeTab === 'finished' && filteredFinished.length === 0) || (activeTab === 'scrap' && filteredScrap.length === 0)) && (
                        <div className="col-span-full py-12 flex flex-col items-center justify-center text-industrial-muted border-2 border-dashed border-industrial-border/50 rounded-xl">
                            <Search className="w-8 h-8 mb-2 opacity-50" />
                            <p>No items match your search.</p>
                            {searchQuery && (
                                <button onClick={() => setSearchQuery('')} className="mt-2 text-industrial-accent hover:underline text-sm">
                                    Clear Search
                                </button>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* SELL MODAL */}
            {selectedItem && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
                    <div className="card w-full max-w-sm animate-in zoom-in-95">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-bold text-white">Sell / Dispatch Item</h3>
                            <button onClick={() => setSelectedItem(null)} className="text-industrial-muted"><X className="w-5 h-5" /></button>
                        </div>

                        {errorMsg && (
                            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-500">
                                {errorMsg}
                            </div>
                        )}

                        <div className="mb-6 p-4 bg-industrial-surface rounded-lg border border-industrial-border/50">
                            <p className="text-sm text-industrial-muted mb-1">Selling Item</p>
                            <p className="font-bold text-white text-lg">
                                {activeTab === 'raw'
                                    ? (selectedItem as RawItem).material_types?.name
                                    : activeTab === 'finished'
                                        ? (selectedItem as FinishedItem).product_master?.sku_name
                                        : (selectedItem as ScrapItem).type}
                            </p>
                            <p className="text-xs text-industrial-muted mt-1">
                                Available: {activeTab === 'scrap'
                                    ? `${(selectedItem as ScrapItem).weight.toFixed(1)} kg`
                                    : `${(selectedItem as RawItem).quantity_pieces || (selectedItem as FinishedItem).quantity} pcs`}
                            </p>
                        </div>

                        <div className="space-y-4 mb-6">
                            {activeTab !== 'scrap' && (
                                <div>
                                    <label className="block text-xs text-industrial-muted mb-1">Quantity (pcs)</label>
                                    <input
                                        type="number"
                                        className="input-field"
                                        value={sellQty}
                                        onChange={e => setSellQty(e.target.value)}
                                        placeholder="0"
                                    />
                                </div>
                            )}
                            <div>
                                <label className="block text-xs text-industrial-muted mb-1">Total Weight (kg)</label>
                                <input
                                    type="number" step="0.1"
                                    className="input-field"
                                    value={sellWeight}
                                    onChange={e => setSellWeight(e.target.value)}
                                    placeholder="Optional / Calculated"
                                />
                            </div>
                        </div>

                        <div className="flex flex-col gap-3">
                            <button
                                onClick={handleSell}
                                disabled={loading}
                                className="w-full btn-primary h-12 flex items-center justify-center gap-2"
                            >
                                {loading ? <Loader2 className="animate-spin" /> : 'Sell Immediately'}
                            </button>
                            <div className="flex gap-3">
                                <button onClick={() => setSelectedItem(null)} className="flex-1 btn-secondary">Cancel</button>
                                <button
                                    onClick={addToCart}
                                    className="flex-1 px-4 py-2 bg-blue-600/20 text-blue-400 border border-blue-600/50 rounded-lg hover:bg-blue-600/30 transition-colors flex items-center justify-center gap-2"
                                >
                                    <ShoppingCart className="w-4 h-4" /> Add to Cart
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Floating Cart Button */}
            {cart.length > 0 && (
                <button
                    onClick={() => setShowCart(true)}
                    className="fixed bottom-24 lg:bottom-6 right-6 btn-primary rounded-full p-4 shadow-2xl animate-in fade-in zoom-in duration-300 flex items-center gap-2 z-50 touch-manipulation"
                >
                    <ShoppingCart className="w-6 h-6" />
                    <span className="font-bold text-lg">{cart.length}</span>
                </button>
            )}

            {/* Cart Modal */}
            {showCart && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
                    <div className="card w-full max-w-2xl max-h-[80vh] flex flex-col animate-in zoom-in-95">
                        <div className="flex justify-between items-center mb-6 border-b border-industrial-border pb-4">
                            <div className="flex items-center gap-3">
                                <ShoppingCart className="w-6 h-6 text-industrial-accent" />
                                <h3 className="text-xl font-bold text-white">Your Cart ({cart.length})</h3>
                            </div>
                            <button onClick={() => setShowCart(false)} className="text-industrial-muted hover:text-white">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                            {cart.length === 0 ? (
                                <div className="text-center py-10 text-industrial-muted">Cart is empty</div>
                            ) : (
                                cart.map(item => (
                                    <div key={item.id} className="flex justify-between items-center p-3 bg-industrial-bg rounded-lg border border-industrial-border">
                                        <div>
                                            <div className="font-bold text-white">{item.name}</div>
                                            <div className="text-xs text-industrial-muted">{item.details}</div>
                                            <span className={`inline-block mt-1 px-2 py-0.5 rounded text-xs font-bold border ${item.type === 'raw' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                                                item.type === 'finished' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                                                    'bg-red-500/10 text-red-400 border-red-500/20'
                                                }`}>
                                                {item.type.toUpperCase()}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <div className="text-right flex flex-col items-end gap-1">
                                                <div className="flex items-center gap-2">
                                                    {/* Quantity Input in Cart */}
                                                    <input
                                                        type="number"
                                                        value={item.sellQty}
                                                        onChange={(e) => updateCartQty(item.id, parseFloat(e.target.value))}
                                                        className="w-16 bg-industrial-surface border border-industrial-border rounded px-2 py-1 text-right text-white font-mono text-sm"
                                                        onClick={(e) => e.stopPropagation()}
                                                    />
                                                    <span className="text-industrial-muted text-xs">{item.type === 'scrap' ? 'kg' : 'pcs'}</span>
                                                </div>
                                                {item.sellWeight && item.sellWeight > 0 && <div className="text-xs text-industrial-muted">~{item.sellWeight.toFixed(2)} kg</div>}
                                            </div>
                                            <button
                                                onClick={() => removeFromCart(item.id)}
                                                className="p-2 hover:bg-red-500/20 rounded-full text-industrial-muted hover:text-red-400 transition-colors"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        <div className="pt-6 mt-4 border-t border-industrial-border">
                            <button
                                onClick={handleBulkCheckout}
                                disabled={loading || cart.length === 0}
                                className="w-full btn-primary h-12 flex items-center justify-center gap-2 text-lg"
                            >
                                {loading ? <Loader2 className="animate-spin" /> : 'Confirm Bulk Sale'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
