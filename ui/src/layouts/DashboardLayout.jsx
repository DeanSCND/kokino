import React, { useState, useEffect } from 'react';
import { GitHubConnection } from '../components/GitHubConnection';
import { ServiceStatusBanner } from '../components/ServiceStatus';
import { CanvasHeader } from '../components/CanvasHeader';

export const DashboardLayout = ({ children, headerControls }) => {
    const [brokerAvailable, setBrokerAvailable] = useState(true);
    const [githubAvailable, setGithubAvailable] = useState(true);

    // Check service health
    useEffect(() => {
        const checkHealth = async () => {
            try {
                const brokerUrl = import.meta.env.VITE_BROKER_URL || 'http://127.0.0.1:5050';
                const response = await fetch(`${brokerUrl}/health`, {
                    signal: AbortSignal.timeout(3000)
                });
                setBrokerAvailable(response.ok);
            } catch (error) {
                setBrokerAvailable(false);
            }

            // GitHub health is based on authentication status
            const githubToken = localStorage.getItem('github_token');
            setGithubAvailable(!!githubToken);
        };

        checkHealth();
        const interval = setInterval(checkHealth, 10000); // Check every 10 seconds
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="flex h-screen w-screen bg-background overflow-hidden text-text-primary font-sans">
            {/* Minimal Sidebar - Logo only */}
            <aside className="w-16 h-screen border-r border-border bg-surface flex flex-col items-center pt-4 z-20">
                {/* Logo */}
                <div className="w-8 h-8 bg-accent-purple rounded-lg flex items-center justify-center font-bold text-sm">
                    K
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 relative">
                {/* Service Status Banner */}
                <ServiceStatusBanner
                    brokerAvailable={brokerAvailable}
                    githubAvailable={githubAvailable}
                />

                {/* Header with controls */}
                <header className="absolute top-0 left-0 right-0 h-14 border-b border-border bg-background/80 backdrop-blur-md z-10 flex items-center px-6 justify-between">
                    <div className="flex items-center gap-2 text-sm text-text-muted">
                        <span className="text-text-primary font-medium">Team Canvas</span>
                        <span>/</span>
                        <span>Overview</span>
                    </div>

                    {/* Right-aligned controls */}
                    <div className="flex items-center gap-4">
                        {headerControls}
                        <div className="w-px h-6 bg-border" />
                        <GitHubConnection />
                    </div>
                </header>

                {/* Canvas area - full height minus header */}
                <div className="absolute top-14 left-0 right-0 bottom-0">
                    {children}
                </div>
            </main>
        </div>
    );
};
