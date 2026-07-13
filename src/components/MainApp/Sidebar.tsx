/**
 * Sidebar — Navigation sidebar with page links.
 */
import React from 'react';
import { Iconify, type IconName } from '../../utils/icons';

type Page = 'home' | 'settings' | 'models' | 'history' | 'benchmark' | 'llm-models';

interface SidebarProps {
  currentPage: Page;
  isOpen: boolean;
  onPageChange: (page: Page) => void;
  onToggle: () => void;
}

const NAV_ITEMS: { id: Page; icon: IconName; label: string }[] = [
  { id: 'home', icon: 'record', label: 'Record' },
  { id: 'models', icon: 'models', label: 'Models' },
  { id: 'llm-models', icon: 'spark', label: 'LLM' },
  { id: 'history', icon: 'history', label: 'History' },
  { id: 'benchmark', icon: 'benchmark', label: 'Benchmark' },
  { id: 'settings', icon: 'settings', label: 'Settings' },
];

export function Sidebar({ currentPage, isOpen, onPageChange, onToggle }: SidebarProps) {
  return (
    <aside className={`sidebar ${isOpen ? 'open' : 'closed'}`}>
      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${currentPage === item.id ? 'active' : ''}`}
            onClick={() => onPageChange(item.id)}
            title={item.label}
          >
            <span className="nav-icon">
              <Iconify icon={item.icon} size={20} />
            </span>
            {isOpen && <span className="nav-label">{item.label}</span>}
          </button>
        ))}
      </nav>
      <div className="sidebar-footer">
        <button
          className="nav-item"
          onClick={onToggle}
          title={isOpen ? 'Collapse' : 'Expand'}
        >
          <span className="nav-icon">
            <Iconify icon={isOpen ? 'chevronLeft' : 'chevronRight'} size={20} />
          </span>
          {isOpen && <span className="nav-label">Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
