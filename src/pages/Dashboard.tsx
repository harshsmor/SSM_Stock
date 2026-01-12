import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Package, ShoppingCart, Trash2, ArrowUpRight, Settings } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Dashboard() {
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        rawWeight: 0,
        finishedCount: 0,
        scrapWeight: 0
    });

    useEffect(() => {
        fetchStats();
    }, []);

    async function fetchStats() {
        try {
            // 1. Raw Weight: Sum(qty * weight_per_piece)
            const { data: rawData } = await supabase.from('inventory_raw')
                .select('quantity_pieces, weight_per_piece');

            const rawWeight = rawData?.reduce((sum, item) => {
                return sum + (item.quantity_pieces * item.weight_per_piece);
            }, 0) || 0;

            // 2. Finished Count: Sum(quantity)
            const { data: finData } = await supabase.from('inventory_finished')
                .select('quantity');
            const finishedCount = finData?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0;

            // 3. Scrap Weight: Sum(weight_kg)
            const { data: scrapData } = await supabase.from('scrap_log').select('weight_kg');
            const scrapWeight = scrapData?.reduce((sum, item) => sum + (item.weight_kg || 0), 0) || 0;

            setStats({ rawWeight, finishedCount, scrapWeight });
        } catch (error) {
            console.error('Error fetching stats:', error);
        } finally {
            setLoading(false);
        }
    }

    const StatCard = ({ title, value, unit, icon: Icon, colorClass, link }: { title: string, value: string | number, unit: string, icon: any, colorClass: string, link: string }) => (
        <Link to={link} className="card group hover:border-industrial-accent/50 transition-all duration-300 hover:bg-industrial-surface/80">
            <div className="flex items-start justify-between mb-4">
                <div className={`p-3 rounded-lg ${colorClass} group-hover:scale-110 transition-transform`}>
                    <Icon className="w-6 h-6" />
                </div>
                <ArrowUpRight className="w-5 h-5 text-industrial-muted group-hover:text-white transition-colors" />
            </div>
            <p className="text-industrial-muted text-sm font-medium mb-1">{title}</p>
            <h3 className="text-3xl font-bold text-white tracking-tight flex items-baseline gap-2">
                {loading ? <div className="h-8 w-24 bg-industrial-border animate-pulse rounded" /> : value.toLocaleString()}
                <span className="text-sm font-normal text-industrial-muted">{unit}</span>
            </h3>
        </Link>
    );

    const QuickAction = ({ title, desc, icon: Icon, link, color }: { title: string, desc: string, icon: any, link: string, color: string }) => (
        <Link to={link} className="flex items-center gap-4 p-4 rounded-xl bg-industrial-surface border border-industrial-border hover:border-industrial-accent/50 hover:bg-industrial-surface/80 transition-all group">
            <div className={`p-3 rounded-lg bg-industrial-bg border border-industrial-border group-hover:scale-110 transition-transform ${color}`}>
                <Icon className="w-6 h-6" />
            </div>
            <div>
                <h3 className="font-bold text-white group-hover:text-industrial-accent transition-colors">{title}</h3>
                <p className="text-xs text-industrial-muted">{desc}</p>
            </div>
        </Link>
    );

    return (
        <div className="max-w-6xl mx-auto space-y-8">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold text-white mb-2">My Factory</h1>
                <p className="text-industrial-muted">Real-time production overview & controls</p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatCard
                    title="Raw Material Stock"
                    value={stats.rawWeight.toFixed(0)}
                    unit="kg"
                    icon={Package}
                    colorClass="bg-blue-500/10 text-blue-500"
                    link="/inventory"
                />
                <StatCard
                    title="Finished Goods"
                    value={stats.finishedCount}
                    unit="pcs"
                    icon={ShoppingCart}
                    colorClass="bg-green-500/10 text-green-500"
                    link="/inventory"
                />
                <StatCard
                    title="Total Scrap Generated"
                    value={stats.scrapWeight.toFixed(0)}
                    unit="kg"
                    icon={Trash2}
                    colorClass="bg-red-500/10 text-red-500"
                    link="/inventory"
                />
            </div>

            {/* Operations Section */}
            <div>
                <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                    <Settings className="w-5 h-5 text-industrial-accent" /> Operations
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <QuickAction
                        title="Inward Stock"
                        desc="Add new raw material"
                        icon={Package}
                        link="/inward"
                        color="text-blue-400"
                    />
                    <QuickAction
                        title="Plate Cutting"
                        desc="Cut plates into circles"
                        icon={Trash2} // Using Trash/Scissors metaphor or generic settings
                        link="/cutting"
                        color="text-orange-400"
                    />
                    <QuickAction
                        title="Processing"
                        desc="Machining & Finishing"
                        icon={Settings}
                        link="/processing"
                        color="text-purple-400"
                    />
                    <QuickAction
                        title="Inventory"
                        desc="View & Sell Stock"
                        icon={ShoppingCart}
                        link="/inventory"
                        color="text-green-400"
                    />
                </div>
            </div>
        </div>
    );
}
