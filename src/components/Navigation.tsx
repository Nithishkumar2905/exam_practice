import React, { useState } from 'react';
import {
  Home,
  Compass,
  Mic,
  Clock,
  Brain,
  Calendar,
  History,
  BarChart2,
  Settings,
  HelpCircle,
  LogOut,
  ChevronLeft,
  ChevronRight,
  User as UserIcon,
  ShieldCheck,
  Cpu,
  Database,
  X,
  LogIn
} from 'lucide-react';
import { useAccessibility } from '../context/AccessibilityContext.tsx';
import { SCREEN_REGISTRY, ScreenId } from '../types/screens.ts';

interface NavigationProps {
  onOpenHelp?: () => void;
}

export function Navigation({ onOpenHelp }: NavigationProps) {
  const {
    currentScreen,
    navigateTo,
    user,
    logout,
    isSidebarCollapsed,
    toggleSidebar,
    isMobileNavOpen,
    setIsMobileNavOpen
  } = useAccessibility();

  const [showHelpDialog, setShowHelpDialog] = useState(false);

  const isAdmin = user?.role === 'admin';

  // Main Navigation items per Phase 3 specifications
  const mainNavItems: { id: ScreenId; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'Overview', icon: <Home className="w-4 h-4 shrink-0" /> },
    { id: 'topics', label: 'Explore Subjects', icon: <Compass className="w-4 h-4 shrink-0" /> },
    { id: 'voice_practice', label: 'Voice Practice', icon: <Mic className="w-4 h-4 shrink-0" /> },
    { id: 'mock_exam', label: 'Mock Examination', icon: <Clock className="w-4 h-4 shrink-0" /> },
    { id: 'ai_tutor', label: 'AI Tutor', icon: <Brain className="w-4 h-4 shrink-0" /> },
    { id: 'revision_planner', label: 'Revision Planner', icon: <Calendar className="w-4 h-4 shrink-0" /> },
    { id: 'learning_history', label: 'Learning History', icon: <History className="w-4 h-4 shrink-0" /> },
    { id: 'progress', label: 'Progress Analytics', icon: <BarChart2 className="w-4 h-4 shrink-0" /> }
  ];

  // Admin items
  const adminNavItems: { id: ScreenId; label: string; icon: React.ReactNode }[] = [
    { id: 'model_evaluation', label: 'ML Evaluation', icon: <Cpu className="w-4 h-4 shrink-0" /> },
    { id: 'model_training', label: 'Dataset & Training', icon: <Database className="w-4 h-4 shrink-0" /> }
  ];

  const handleNavClick = (screenId: ScreenId) => {
    navigateTo(screenId);
    if (isMobileNavOpen) {
      setIsMobileNavOpen(false);
    }
  };

  const handleHelpClick = () => {
    if (onOpenHelp) {
      onOpenHelp();
    } else {
      setShowHelpDialog(true);
    }
    if (isMobileNavOpen) {
      setIsMobileNavOpen(false);
    }
  };

  const renderNavList = (isMobile: boolean = false) => {
    const collapsed = !isMobile && isSidebarCollapsed;

    return (
      <div className="flex flex-col h-full justify-between">
        {/* Main Links */}
        <div className="space-y-6">
          <div>
            {!collapsed && (
              <p className="px-3 mb-2 text-[10px] font-bold uppercase tracking-wider text-[#64748B]">
                Menu
              </p>
            )}
            <ul className="space-y-1" role="list">
              {mainNavItems.map((item) => {
                const isActive = currentScreen === item.id;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => handleNavClick(item.id)}
                      aria-current={isActive ? 'page' : undefined}
                      aria-label={item.label}
                      title={collapsed ? item.label : undefined}
                      className={`w-full flex items-center transition-colors group relative rounded-lg text-left ${
                        collapsed
                          ? 'justify-center p-2.5'
                          : 'gap-3 px-3 py-2 text-xs font-semibold'
                      } ${
                        isActive
                          ? 'bg-[#EEF4FF] text-[#1749E8] font-bold'
                          : 'text-[#64748B] hover:text-[#172033] hover:bg-[#F8F9FB]'
                      }`}
                    >
                      {isActive && (
                        <span
                          className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-[#1749E8] rounded-r"
                          aria-hidden="true"
                        />
                      )}
                      <span className={isActive ? 'text-[#1749E8]' : 'text-[#64748B] group-hover:text-[#172033]'}>
                        {item.icon}
                      </span>
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Admin Navigation */}
          {isAdmin && (
            <div>
              {!collapsed && (
                <p className="px-3 mb-2 text-[10px] font-bold uppercase tracking-wider text-[#64748B]">
                  Academic Review
                </p>
              )}
              <ul className="space-y-1" role="list">
                {adminNavItems.map((item) => {
                  const isActive = currentScreen === item.id;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => handleNavClick(item.id)}
                        aria-current={isActive ? 'page' : undefined}
                        aria-label={item.label}
                        title={collapsed ? item.label : undefined}
                        className={`w-full flex items-center transition-colors group relative rounded-lg text-left ${
                          collapsed
                            ? 'justify-center p-2.5'
                            : 'gap-3 px-3 py-2 text-xs font-semibold'
                        } ${
                          isActive
                            ? 'bg-[#EEF4FF] text-[#1749E8] font-bold'
                            : 'text-[#64748B] hover:text-[#172033] hover:bg-[#F8F9FB]'
                        }`}
                      >
                        {isActive && (
                          <span
                            className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-[#1749E8] rounded-r"
                            aria-hidden="true"
                          />
                        )}
                        <span className={isActive ? 'text-[#1749E8]' : 'text-[#64748B] group-hover:text-[#172033]'}>
                          {item.icon}
                        </span>
                        {!collapsed && <span className="truncate">{item.label}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        {/* Bottom Navigation: Settings, Help, Profile, Logout */}
        <div className="pt-4 border-t border-[#E8EBF0] space-y-1">
          {/* Accessibility Settings */}
          <button
            type="button"
            onClick={() => handleNavClick('accessibility_settings')}
            aria-current={currentScreen === 'accessibility_settings' ? 'page' : undefined}
            title={collapsed ? 'Accessibility Settings' : undefined}
            className={`w-full flex items-center transition-colors group relative rounded-lg text-left ${
              collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2 text-xs font-semibold'
            } ${
              currentScreen === 'accessibility_settings'
                ? 'bg-[#EEF4FF] text-[#1749E8] font-bold'
                : 'text-[#64748B] hover:text-[#172033] hover:bg-[#F8F9FB]'
            }`}
          >
            <Settings className="w-4 h-4 shrink-0 text-[#64748B] group-hover:text-[#172033]" />
            {!collapsed && <span className="truncate">Accessibility Settings</span>}
          </button>

          {/* Help & Support */}
          <button
            type="button"
            onClick={handleHelpClick}
            title={collapsed ? 'Help & Shortcuts' : undefined}
            className={`w-full flex items-center transition-colors group relative rounded-lg text-left ${
              collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2 text-xs font-semibold'
            } text-[#64748B] hover:text-[#172033] hover:bg-[#F8F9FB]`}
          >
            <HelpCircle className="w-4 h-4 shrink-0 text-[#64748B] group-hover:text-[#172033]" />
            {!collapsed && <span className="truncate">Help &amp; Support</span>}
          </button>

          {/* User Profile info */}
          {user && (
            <div className={`mt-2 pt-2 border-t border-[#E8EBF0] flex items-center ${collapsed ? 'flex-col gap-2' : 'justify-between gap-2'} px-1`}>
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-7 h-7 rounded-full bg-[#EEF4FF] border border-[#D9E1EF] flex items-center justify-center font-bold text-xs text-[#1749E8] shrink-0">
                  {user.name.charAt(0)}
                </div>
                {!collapsed && (
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-[#172033] truncate">{user.name}</p>
                    <p className="text-[10px] text-[#64748B] truncate">{user.rollNumber}</p>
                  </div>
                )}
              </div>

              {/* Logout button */}
              <button
                type="button"
                onClick={logout}
                aria-label="Log Out of candidate session"
                title="Log Out (Sign out)"
                className="p-1.5 rounded-md text-[#64748B] hover:text-[#DC2626] hover:bg-red-50 transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      {/* 1. Desktop Sidebar */}
      <aside
        aria-label="Application Sidebar Navigation"
        className={`hidden lg:flex flex-col shrink-0 bg-white border-r border-[#E8EBF0] transition-all duration-200 select-none ${
          isSidebarCollapsed ? 'w-16' : 'w-60'
        }`}
      >
        {/* Sidebar Header / Brand / Collapse Toggle */}
        <div className="h-14 px-3 flex items-center justify-between border-b border-[#E8EBF0]">
          {!isSidebarCollapsed ? (
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-[#1749E8] flex items-center justify-center font-black text-xs text-white shrink-0">
                APX
              </div>
              <div className="min-w-0">
                <span className="font-extrabold text-xs tracking-tight text-[#172033] block truncate">
                  ACCESSPREP-X
                </span>
                <span className="text-[10px] text-[#64748B] block truncate">
                  SSC MTS Portal
                </span>
              </div>
            </div>
          ) : (
            <div className="w-full flex justify-center">
              <div className="w-7 h-7 rounded-lg bg-[#1749E8] flex items-center justify-center font-black text-xs text-white">
                A
              </div>
            </div>
          )}

          {/* Collapse/Expand toggle button */}
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={isSidebarCollapsed ? 'Expand sidebar navigation' : 'Collapse sidebar navigation'}
            aria-expanded={!isSidebarCollapsed}
            title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="p-1 rounded-md text-[#64748B] hover:text-[#172033] hover:bg-[#F8F9FB] transition-colors focus:outline-none focus:ring-2 focus:ring-[#1749E8]"
          >
            {isSidebarCollapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Scrollable Navigation Menu */}
        <nav className="flex-1 overflow-y-auto p-2.5" aria-label="Main Navigation">
          {renderNavList(false)}
        </nav>
      </aside>

      {/* 2. Mobile Responsive Drawer (< lg screens) */}
      {isMobileNavOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Mobile Navigation Menu"
          className="lg:hidden fixed inset-0 z-50 flex"
        >
          {/* Backdrop overlay */}
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity"
            onClick={() => setIsMobileNavOpen(false)}
            aria-hidden="true"
          />

          {/* Drawer content */}
          <div className="relative w-64 max-w-[85vw] bg-white text-[#172033] h-full flex flex-col z-10 shadow-xl border-r border-[#E8EBF0]">
            {/* Header */}
            <div className="h-14 px-4 flex items-center justify-between border-b border-[#E8EBF0]">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[#1749E8] flex items-center justify-center font-black text-xs text-white">
                  APX
                </div>
                <div>
                  <span className="font-extrabold text-xs text-[#172033] block">
                    ACCESSPREP-X
                  </span>
                  <span className="text-[10px] text-[#64748B] block">
                    SSC MTS Portal
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsMobileNavOpen(false)}
                aria-label="Close navigation drawer"
                className="p-1.5 rounded-md text-[#64748B] hover:text-[#172033] hover:bg-[#F8F9FB]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Nav list */}
            <nav className="flex-1 overflow-y-auto p-3" aria-label="Mobile Navigation">
              {renderNavList(true)}
            </nav>
          </div>
        </div>
      )}

      {/* Fallback Help Dialog */}
      {showHelpDialog && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="help-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50"
        >
          <div className="bg-white rounded-xl border border-[#E8EBF0] max-w-md w-full p-6 shadow-xl text-[#172033]">
            <div className="flex items-center justify-between pb-3 border-b border-[#E8EBF0] mb-4">
              <h3 id="help-title" className="text-base font-bold text-[#172033] flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-[#1749E8]" />
                Accessible Keyboard Shortcuts
              </h3>
              <button
                type="button"
                onClick={() => setShowHelpDialog(false)}
                className="text-xs font-semibold px-2 py-1 bg-[#F8F9FB] hover:bg-[#E8EBF0] rounded"
              >
                Close
              </button>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between p-2 bg-[#F8F9FB] rounded border border-[#E8EBF0]">
                <span>Toggle Hands-Free Blind Mode</span>
                <kbd className="font-mono font-bold bg-white px-1.5 py-0.5 rounded border border-[#E8EBF0]">Alt + B</kbd>
              </div>
              <div className="flex justify-between p-2 bg-[#F8F9FB] rounded border border-[#E8EBF0]">
                <span>Read Aloud Current Section</span>
                <kbd className="font-mono font-bold bg-white px-1.5 py-0.5 rounded border border-[#E8EBF0]">Alt + R</kbd>
              </div>
              <div className="flex justify-between p-2 bg-[#F8F9FB] rounded border border-[#E8EBF0]">
                <span>Candidate Dashboard</span>
                <kbd className="font-mono font-bold bg-white px-1.5 py-0.5 rounded border border-[#E8EBF0]">Alt + D</kbd>
              </div>
              <div className="flex justify-between p-2 bg-[#F8F9FB] rounded border border-[#E8EBF0]">
                <span>AI Tutor Scribe</span>
                <kbd className="font-mono font-bold bg-white px-1.5 py-0.5 rounded border border-[#E8EBF0]">Alt + T</kbd>
              </div>
              <div className="flex justify-between p-2 bg-[#F8F9FB] rounded border border-[#E8EBF0]">
                <span>Accessibility Settings</span>
                <kbd className="font-mono font-bold bg-white px-1.5 py-0.5 rounded border border-[#E8EBF0]">Alt + S</kbd>
              </div>
            </div>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setShowHelpDialog(false)}
                className="px-4 py-2 bg-[#1749E8] text-white text-xs font-semibold rounded-lg hover:bg-[#123BB8]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
