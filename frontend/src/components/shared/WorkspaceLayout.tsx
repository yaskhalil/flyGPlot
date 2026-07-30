// Shared workspace layout: 300px control panel | 1fr visualization
// All 5 tabs use this instead of duplicating grid + card markup.

import type { ReactNode } from 'react';
import { Compass } from 'lucide-react';

interface WorkspaceLayoutProps {
  /** UPPER_CASE title for the left control card header */
  title: string;
  /** Optional icon; defaults to a Compass icon */
  icon?: ReactNode;
  /** Content rendered inside the left control card */
  controls: ReactNode;
  /** Content rendered in the right panel (charts, tables, graphs) */
  children: ReactNode;
  /** Optional extra left-side items below the main control card */
  extraControls?: ReactNode;
  /** When true, the left panel is hidden and only children renders full-width */
  fullWidth?: boolean;
}

export function WorkspaceLayout({
  title,
  icon = <Compass size={14} />,
  controls,
  children,
  extraControls,
  fullWidth = false,
}: WorkspaceLayoutProps) {
  if (fullWidth) {
    return <>{children}</>;
  }

  return (
    <div className="workspace-layout">
      <div className="workspace-layout-left">
        <div className="card control-card">
          <h3 className="control-card-header">
            {icon}
            {title}
          </h3>
          {controls}
        </div>
        {extraControls}
      </div>
      <div className="workspace-layout-right">{children}</div>
    </div>
  );
}

export default WorkspaceLayout;
