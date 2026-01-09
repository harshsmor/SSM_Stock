import { useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import {
    LayoutDashboard,
    PackagePlus,
    Scissors,
    CircleDot,
    Menu,
    X,
    LogOut
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import clsx from 'clsx';

export default function Layout() {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const location = useLocation();
    const { signOut } = useAuth();

    const navigation = [
        { name: 'Dashboard', href: '/', icon: LayoutDashboard },
        { name: 'Inward Stock', href: '/inward', icon: PackagePlus },
        { name: 'Plate Cutting', href: '/cutting', icon: Scissors },
        { name: 'Billa Generation', href: '/billa', icon: CircleDot },
    ];

    const handleSignOut = async () => {
        await signOut();
    };

    return (
        <div className="min-h-screen bg-industrial-bg flex">
            {/* Mobile Menu Backdrop */}
            {isMobileMenuOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 lg:hidden"
                    onClick={() => setIsMobileMenuOpen(false)}
                />
            )}

            {/* Sidebar */}
            <div className={clsx(
                "fixed lg:static inset-y-0 left-0 z-50 w-64 bg-industrial-surface border-r border-industrial-border transform transition-transform duration-200 lg:transform-none flex flex-col",
                isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
            )}>
                <div className="p-6 border-b border-industrial-border flex items-center justify-between">
                    <div>
                        <h1 className="text-xl font-bold text-white tracking-wider">SSM STOCK</h1>
                        <p className="text-xs text-industrial-muted">Inventory System</p>
                    </div>
                    <button
                        onClick={() => setIsMobileMenuOpen(false)}
                        className="lg:hidden text-industrial-muted hover:text-white"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
                    {navigation.map((item) => {
                        const Icon = item.icon;
                        const isActive = location.pathname === item.href;
                        return (
                            <Link
                                key={item.name}
                                to={item.href}
                                onClick={() => setIsMobileMenuOpen(false)}
                                className={clsx(
                                    "flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200",
                                    isActive
                                        ? "bg-industrial-accent text-black font-bold shadow-[0_0_15px_rgba(245,158,11,0.3)]"
                                        : "text-industrial-muted hover:bg-industrial-border/50 hover:text-white"
                                )}
                            >
                                <Icon className={clsx("w-5 h-5", isActive ? "stroke-[2.5]" : "stroke-2")} />
                                {item.name}
                            </Link>
                        );
                    })}
                </nav>

                <div className="p-4 border-t border-industrial-border">
                    <button
                        onClick={handleSignOut}
                        className="flex items-center gap-3 px-4 py-3 w-full rounded-lg text-industrial-muted hover:bg-red-500/10 hover:text-red-500 transition-colors"
                    >
                        <LogOut className="w-5 h-5" />
                        Sign Out
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col min-h-screen">
                {/* Mobile Header */}
                <div className="lg:hidden p-4 bg-industrial-surface border-b border-industrial-border sticky top-0 z-30 flex items-center justify-between">
                    <h2 className="text-lg font-bold text-white">
                        {navigation.find(i => i.href === location.pathname)?.name || 'SSM Stock'}
                    </h2>
                    <button
                        onClick={() => setIsMobileMenuOpen(true)}
                        className="p-2 text-white bg-industrial-border rounded-md"
                    >
                        <Menu className="w-6 h-6" />
                    </button>
                </div>

                <main className="flex-1 p-4 lg:p-8 max-w-7xl mx-auto w-full">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
