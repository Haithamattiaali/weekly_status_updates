import { PortfolioSnapshot, DashboardVM, StatusRow, MilestoneRow } from '../domain/types.js';

export class Transformer {
  toViewModel(domain: PortfolioSnapshot): DashboardVM {
    // Format periods for display
    const currentPeriod = this.formatPeriod(
      domain.headers.currentPeriodStart,
      domain.headers.currentPeriodEnd
    );

    const comparisonPeriod = this.formatPeriod(
      domain.headers.comparisonPeriodStart || '',
      domain.headers.comparisonPeriodEnd || ''
    );

    // Get section titles with defaults
    const sectionTitles = {
      portfolioStatus: domain.headers.sectionTitles?.portfolioStatus || 'Portfolio Projects Status',
      highlightsLowlights: domain.headers.sectionTitles?.highlightsLowlights || 'Consolidated Highlights & Lowlights (All Projects)',
      keyMilestones: domain.headers.sectionTitles?.keyMilestones || 'Key Milestones by Project',
    };

    // Get table headers with defaults
    const tableHeaders = {
      project: domain.headers.tableHeaders?.project || 'Project',
      status: domain.headers.tableHeaders?.status || 'Status',
      projectManager: domain.headers.tableHeaders?.projectManager || 'Project Manager',
      nextMilestone: domain.headers.tableHeaders?.nextMilestone || 'Next Milestone',
      milestone: domain.headers.tableHeaders?.milestone || 'Milestone',
      owner: domain.headers.tableHeaders?.owner || 'Owner',
      dueDate: domain.headers.tableHeaders?.dueDate || 'Due Date',
      statusBadge: domain.headers.tableHeaders?.statusBadge || 'Status',
      workstreamUpdate: domain.headers.tableHeaders?.workstreamUpdate || 'Workstream Update',
    };

    // Transform status table
    const statusTable = domain.status
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map(row => ({
        project: row.project,
        statusClass: this.getStatusClass(row.statusColor),
        trendGlyph: this.getTrendGlyph(row.trend),
        manager: row.manager,
        nextMilestone: row.nextMilestone,
      }));

    // Transform highlights and lowlights to simple strings
    const highlights = domain.highlights
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map(h => h.project ? `${h.project}: ${h.description}` : h.description);

    const lowlights = domain.lowlights
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map(l => l.project ? `${l.project}: ${l.description}` : l.description);

    // Transform milestones table
    const milestonesTable = domain.milestones
      .sort((a, b) => {
        // Sort by project first, then by order
        const projectCompare = a.project.localeCompare(b.project);
        if (projectCompare !== 0) return projectCompare;
        return (a.order || 0) - (b.order || 0);
      })
      .map(row => ({
        project: row.project,
        milestone: row.milestone,
        owner: row.owner,
        dueDateBadge: row.dueDate,
        statusBadgeClass: this.getStatusBadgeClass(row.statusBadge),
        workstreamUpdate: row.workstreamUpdate || '',
      }));

    return {
      header: {
        title: 'PROCEED® Weekly Project Portfolio Updates',
        portfolio: domain.headers.portfolio,
        currentPeriod,
        comparisonPeriod,
        reportDate: domain.headers.reportDate,
        sectionTitles,
        tableHeaders,
      },
      statusTable,
      highlights,
      lowlights,
      milestonesTable,
    };
  }

  private formatPeriod(start: string, end: string): string {
    if (!start || !end) return 'N/A';

    // If dates are already formatted (e.g., "Sept 11"), just combine them
    if (start.includes(' ') || end.includes(' ')) {
      return `${start} - ${end}`;
    }

    // Try to parse ISO dates and format them
    try {
      const startDate = new Date(start);
      const endDate = new Date(end);

      if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
        const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
        const startStr = startDate.toLocaleDateString('en-US', options);
        const endStr = endDate.toLocaleDateString('en-US', options);

        // Add year if dates span different years
        const startYear = startDate.getFullYear();
        const endYear = endDate.getFullYear();

        if (startYear !== endYear) {
          return `${startStr}, ${startYear} - ${endStr}, ${endYear}`;
        } else {
          return `${startStr} - ${endStr}, ${endYear}`;
        }
      }
    } catch {
      // Fall through to default
    }

    // Default: return as-is
    return `${start} - ${end}`;
  }

  private getStatusClass(color: string): 'status-green' | 'status-amber' | 'status-red' {
    switch (color.toLowerCase()) {
      case 'green':
        return 'status-green';
      case 'amber':
      case 'yellow':
        return 'status-amber';
      case 'red':
        return 'status-red';
      default:
        return 'status-amber';
    }
  }

  private getTrendGlyph(trend: string): '↑' | '↓' | '→' {
    switch (trend.toLowerCase()) {
      case 'up':
        return '↑';
      case 'down':
        return '↓';
      case 'flat':
      case 'stable':
      default:
        return '→';
    }
  }

  private getStatusBadgeClass(badge: string): string {
    const badgeLower = badge.toLowerCase();

    if (badgeLower === 'completed' || badgeLower === 'complete') {
      return 'status-completed';
    } else if (badgeLower === 'in progress' || badgeLower.includes('progress')) {
      return 'status-in-progress';
    } else if (badgeLower === 'pending') {
      return 'status-pending';
    } else if (badgeLower === 'at risk' || badgeLower.includes('risk')) {
      return 'status-at-risk';
    } else if (badgeLower.includes('%')) {
      // For percentage values, use in-progress style
      return 'status-in-progress';
    } else {
      return 'status-pending';
    }
  }

  fromViewModel(vm: DashboardVM): PortfolioSnapshot {
    // Reverse transformation for round-trip capability
    // This would be used when editing via API rather than Excel

    const statusRows: StatusRow[] = vm.statusTable.map((row, index) => ({
      project: row.project,
      statusColor: this.getColorFromClass(row.statusClass),
      trend: this.getTrendFromGlyph(row.trendGlyph),
      manager: row.manager,
      nextMilestone: row.nextMilestone,
      order: index,
    }));

    const highlights = vm.highlights.map((h, index) => {
      const colonIndex = h.indexOf(':');
      if (colonIndex > 0) {
        return {
          kind: 'highlight' as const,
          project: h.substring(0, colonIndex).trim(),
          description: h.substring(colonIndex + 1).trim(),
          order: index,
        };
      }
      return {
        kind: 'highlight' as const,
        description: h,
        order: index,
      };
    });

    const lowlights = vm.lowlights.map((l, index) => {
      const colonIndex = l.indexOf(':');
      if (colonIndex > 0) {
        return {
          kind: 'lowlight' as const,
          project: l.substring(0, colonIndex).trim(),
          description: l.substring(colonIndex + 1).trim(),
          order: index,
        };
      }
      return {
        kind: 'lowlight' as const,
        description: l,
        order: index,
      };
    });

    const milestones: MilestoneRow[] = vm.milestonesTable.map((row, index) => ({
      project: row.project,
      milestone: row.milestone,
      owner: row.owner,
      dueDate: row.dueDateBadge,
      statusBadge: this.getBadgeFromClass(row.statusBadgeClass),
      workstreamUpdate: row.workstreamUpdate || undefined,
      order: index,
    }));

    // Parse period strings back to start/end
    const currentPeriodParts = this.parsePeriod(vm.header.currentPeriod);
    const comparisonPeriodParts = this.parsePeriod(vm.header.comparisonPeriod);

    return {
      headers: {
        portfolio: vm.header.portfolio,
        currentPeriodStart: currentPeriodParts.start,
        currentPeriodEnd: currentPeriodParts.end,
        comparisonPeriodStart: comparisonPeriodParts.start,
        comparisonPeriodEnd: comparisonPeriodParts.end,
        reportDate: vm.header.reportDate,
        sectionTitles: vm.header.sectionTitles,
        tableHeaders: vm.header.tableHeaders,
      },
      status: statusRows,
      highlights,
      lowlights,
      milestones,
    };
  }

  private getColorFromClass(statusClass: string): 'green' | 'amber' | 'red' {
    if (statusClass.includes('green')) return 'green';
    if (statusClass.includes('amber')) return 'amber';
    if (statusClass.includes('red')) return 'red';
    return 'amber';
  }

  private getTrendFromGlyph(glyph: string): 'up' | 'down' | 'flat' {
    switch (glyph) {
      case '↑': return 'up';
      case '↓': return 'down';
      case '→':
      default: return 'flat';
    }
  }

  private getBadgeFromClass(badgeClass: string): string {
    if (badgeClass.includes('completed')) return 'Completed';
    if (badgeClass.includes('progress')) return 'In Progress';
    if (badgeClass.includes('pending')) return 'Pending';
    if (badgeClass.includes('risk')) return 'At Risk';
    return 'Pending';
  }

  private parsePeriod(periodString: string): { start: string; end: string } {
    const parts = periodString.split(' - ');
    if (parts.length === 2) {
      return { start: parts[0].trim(), end: parts[1].trim() };
    }
    return { start: periodString, end: periodString };
  }
}