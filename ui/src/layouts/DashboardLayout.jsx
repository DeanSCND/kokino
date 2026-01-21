import React from 'react';
import { LayoutDashboard, GitMerge, Terminal, MessageSquare, Users, Settings } from 'lucide-react';

const SidebarItem = ({ icon: Icon, active, label }) => (
    <button
        className={`p-3 rounded-lg mb-2 transition-colors ${active ? 'bg-surface-active text-primary' : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'}`}
        aria-label={label}
        aria-pressed={active}
    >
        <Icon size={24} strokeWidth={1.5} />
    </button>
);

export const DashboardLayout = ({ children }) => {
    return (
        <div className="flex h-screen w-screen bg-background overflow-hidden text-text-primary font-sans">
            {/* Minimal Sidebar - 16px icons only for maximum canvas space */}
            <aside className="w-16 h-full border-r border-border bg-surface flex flex-col items-center py-4 z-20">
                <div className="mb-8">
                    {/* Logo */}
                    <div className="w-8 h-8 bg-accent-purple rounded-lg flex items-center justify-center font-bold text-sm">
                        K
                    </div>
                </div>

                <nav className="flex-1 flex flex-col items-center w-full px-2">
                    <SidebarItem icon={LayoutDashboard} label="Dashboard" />
                    <SidebarItem icon={Users} label="Team Canvas" active />
                    <SidebarItem icon={GitMerge} label="Workflows" />
                    <SidebarItem icon={Terminal} label="Terminals" />
                    <SidebarItem icon={MessageSquare} label="Messages" />
                </nav>

                <div className="mt-auto px-2">
                    <SidebarItem icon={Settings} label="Settings" />
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 relative">
                {/* Header with breadcrumbs */}
                <header className="absolute top-0 left-0 right-0 h-14 border-b border-border bg-background/80 backdrop-blur-md z-10 flex items-center px-6 justify-between">
                    <div className="flex items-center gap-2 text-sm text-text-muted">
                        <span className="text-text-primary font-medium">Team Canvas</span>
                        <span>/</span>
                        <span>Overview</span>
                    </div>
                    <div className="flex items-center gap-4">
                        {/* Placeholder for header actions */}
                        <div className="h-8 w-8 rounded-full bg-surface-hover border border-border"></div>
                    </div>
                </header>

                {/* Canvas area - full height with top padding for header */}
                <div className="w-full h-full pt-14">
                    {children}
                </div>
            </main>
        </div>
    );
};
