import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Package, ShoppingCart, Trash2, ArrowUpRight } from 'lucide-react';
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
            // 1. Raw Weight
            const { data: rawData } = await supabase.from('inventory_raw').select('total_weight_kg');
            const rawWeight = rawData?.reduce((sum, item) => sum + (item.total_weight_kg || 0), 0) || 0;

            // 2. Finished Count
            const { data: finData } = await supabase.from('inventory_finished').select('quantity');
            const finishedCount = finData?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0;

            // 3. Scrap Weight
            const { data: scrapData } = await supabase.from('scrap_log').select('weight_kg');
            const scrapWeight = scrapData?.reduce((sum, item) => sum + (item.weight_kg || 0), 0) || 0;

            setStats({ rawWeight, finishedCount, scrapWeight });
        } catch (error) {
            console.error('Error fetching stats:', error);
        } finally {
            setLoading(false);
        }
    }

    interface StatCardProps {
        title: string;
        value: string | number;
        unit: string;
        icon: React.ElementType;
        colorClass: string;
        link?: string;
    }

    const StatCard = ({ title, value, unit, icon: Icon, colorClass, link }: StatCardProps) => (
        <div className="card hover:border-industrial-accent/50 transition-colors group">
            <div className="flex items-start justify-between mb-4">
                <div className={`p-3 rounded-lg ${colorClass}`}>
                    <Icon className="w-6 h-6" />
                </div>
                {link && (
                    <Link to={link} className="text-industrial-muted hover:text-white transition-colors">
                        <ArrowUpRight className="w-5 h-5" />
                    </Link>
                )}
            </div>
            <p className="text-industrial-muted text-sm mb-1">{title}</p>
            <h3 className="text-3xl font-bold text-white tracking-tight">
                {loading ? <div className="h-8 w-24 bg-industrial-border animate-pulse rounded" /> : value.toLocaleString()}
                <span className="text-sm font-normal text-industrial-muted ml-2">{unit}</span>
            </h3>
        </div>
    );

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold text-white mb-2">My Factory</h1>
                <p className="text-industrial-muted">Real-time production overview</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatCard
                    title="Steel in Stock"
                    value={stats.rawWeight.toFixed(2)}
                    unit="kg"
                    icon={Package}
                    colorClass="bg-blue-500/10 text-blue-500"
                    link="/inward"
                />
                <StatCard
                    title="Ready to Sell"
                    value={stats.finishedCount}
                    unit="pcs"
                    icon={ShoppingCart}
                    colorClass="bg-green-500/10 text-green-500"
                    link="/billa"
                />
                <StatCard
                    title="Scrap Value"
                    value={stats.scrapWeight.toFixed(2)}
                    unit="kg"
                    icon={Trash2}
                    colorClass="bg-red-500/10 text-red-500"
                    link="/cutting"
                />
            </div>

            {/* Quick Actions / Recent Activity could go here */}
            <div className="card bg-gradient-to-br from-industrial-surface to-industrial-bg">
                <h3 className="text-lg font-bold text-white mb-4">Quick Actions</h3>
                <div className="flex flex-wrap gap-4">
                    <Link to="/inward" className="btn-secondary text-sm py-2">
                        + Inward Stock
                    </Link>
                    <Link to="/cutting" className="btn-secondary text-sm py-2">
                        ✂️ Plate Cutting
                    </Link>
                    <Link to="/billa" className="btn-secondary text-sm py-2">
                        ⚙️ Generate Billa
                    </Link>
                </div>
            </div>
        </div>
    );
}
