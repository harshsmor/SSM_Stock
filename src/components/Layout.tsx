import { Link, Outlet, useLocation } from 'react-router-dom';
import {
    LayoutDashboard,
    PackagePlus,
    Scissors,
    Settings,
    Package,
    LogOut
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import clsx from 'clsx';

export default function Layout() {
    const location = useLocation();
    const { signOut } = useAuth();

    const navigation = [
        { name: 'Dashboard', href: '/', icon: LayoutDashboard },
        { name: 'Inward', href: '/inward', icon: PackagePlus },
        { name: 'Cutting', href: '/cutting', icon: Scissors },
        { name: 'Process', href: '/processing', icon: Settings },
        { name: 'Stock', href: '/inventory', icon: Package },
    ];

    const handleSignOut = async () => {
        await signOut();
    };

    return (
        <div className="min-h-screen bg-industrial-bg flex flex-col lg:flex-row">

            {/* Sidebar (Desktop Only) */}
            <div className="hidden lg:flex fixed inset-y-0 left-0 z-50 w-64 bg-industrial-surface border-r border-industrial-border flex-col">
                <div className="p-6 border-b border-industrial-border flex items-center gap-3">
                    <img src="/logo.png" alt="SSM Stock Logo" className="w-10 h-10 object-contain" />
                    <div>
                        <h1 className="text-xl font-bold text-white tracking-wider">SSM STOCK</h1>
                        <p className="text-xs text-industrial-muted">Inventory System</p>
                    </div>
                </div>

                <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
                    {navigation.map((item) => {
                        const Icon = item.icon;
                        const isActive = location.pathname === item.href;
                        return (
                            <Link
                                key={item.name}
                                to={item.href}
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
            <div className="flex-1 flex flex-col min-h-screen lg:ml-64 mb-16 lg:mb-0">
                {/* Mobile Header (Logo & Title Only) */}
                <div className="lg:hidden p-4 bg-industrial-surface border-b border-industrial-border sticky top-0 z-30 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <img src="/logo.png" alt="SSM Stock" className="w-8 h-8 object-contain" />
                        <h2 className="text-lg font-bold text-white">
                            {navigation.find(i => i.href === location.pathname)?.name || 'SSM Stock'}
                        </h2>
                    </div>
                    {/* Logout Button for Mobile */}
                    <button onClick={handleSignOut} className="text-industrial-muted hover:text-red-500">
                        <LogOut className="w-5 h-5" />
                    </button>
                </div>

                <main className="flex-1 p-4 lg:p-8 max-w-7xl mx-auto w-full">
                    <Outlet />
                </main>
            </div>

            {/* Bottom Navigation (Mobile Only) */}
            <div className="lg:hidden fixed bottom-0 inset-x-0 z-50 bg-black/90 backdrop-blur-md border-t border-industrial-border pb-2">
                <nav className="flex justify-around items-center h-16">
                    {navigation.map((item) => {
                        const Icon = item.icon;
                        const isActive = location.pathname === item.href;
                        return (
                            <Link
                                key={item.name}
                                to={item.href}
                                className={clsx(
                                    "flex flex-col items-center justify-center w-full h-full space-y-1",
                                    isActive ? "text-industrial-accent" : "text-industrial-muted hover:text-white"
                                )}
                            >
                                <Icon className={clsx("w-6 h-6", isActive && "stroke-[2.5] drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]")} />
                                <span className="text-[10px] font-medium tracking-wide">{item.name}</span>
                            </Link>
                        );
                    })}
                </nav>
            </div>

        </div>
    );
}
