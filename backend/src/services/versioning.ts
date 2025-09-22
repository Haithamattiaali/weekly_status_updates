import { PrismaClient } from '@prisma/client';
import { PortfolioSnapshot, DashboardVM } from '../domain/types.js';

export class VersioningService {
  constructor(private prisma: PrismaClient) {}

  async createSnapshot(
    domain: PortfolioSnapshot,
    viewModel: DashboardVM,
    rawExcel: Buffer | null,
    actor?: string,
    notes?: string
  ): Promise<string> {
    const snapshot = await this.prisma.snapshot.create({
      data: {
        actor,
        notes,
        rawExcel,
        domainData: JSON.stringify(domain),
        viewModel: JSON.stringify(viewModel),
        headers: {
          create: {
            portfolio: domain.headers.portfolio,
            currentPeriodStart: domain.headers.currentPeriodStart,
            currentPeriodEnd: domain.headers.currentPeriodEnd,
            comparisonPeriodStart: domain.headers.comparisonPeriodStart,
            comparisonPeriodEnd: domain.headers.comparisonPeriodEnd,
            reportDate: domain.headers.reportDate,
            sectionTitles: domain.headers.sectionTitles ? JSON.stringify(domain.headers.sectionTitles) : null,
            tableHeaders: domain.headers.tableHeaders ? JSON.stringify(domain.headers.tableHeaders) : null,
          },
        },
        status: {
          create: domain.status.map(s => ({
            project: s.project,
            statusColor: s.statusColor,
            trend: s.trend,
            manager: s.manager,
            nextMilestone: s.nextMilestone,
            order: s.order || 0,
          })),
        },
        highlights: {
          create: domain.highlights.map(h => ({
            project: h.project,
            description: h.description,
            order: h.order || 0,
          })),
        },
        lowlights: {
          create: domain.lowlights.map(l => ({
            project: l.project,
            description: l.description,
            order: l.order || 0,
          })),
        },
        milestones: {
          create: domain.milestones.map(m => ({
            project: m.project,
            milestone: m.milestone,
            owner: m.owner,
            dueDate: m.dueDate,
            statusBadge: m.statusBadge,
            workstreamUpdate: m.workstreamUpdate,
            order: m.order || 0,
          })),
        },
        metrics: domain.metrics
          ? {
              create: domain.metrics.map(m => ({
                project: m.project,
                spi: m.spi,
                cpi: m.cpi,
                sev1Defects: m.sev1Defects,
                sev2Defects: m.sev2Defects,
                issues: m.issues,
                riskScore: m.riskScore,
                milestoneCompletion: m.milestoneCompletion,
              })),
            }
          : undefined,
      },
    });

    // Update current snapshot pointer
    await this.prisma.currentSnapshot.upsert({
      where: { id: 'current' },
      create: { id: 'current', snapshotId: snapshot.id },
      update: { snapshotId: snapshot.id },
    });

    return snapshot.id;
  }

  async getCurrentSnapshot(): Promise<{ domain: PortfolioSnapshot; viewModel: DashboardVM } | null> {
    const current = await this.prisma.currentSnapshot.findUnique({
      where: { id: 'current' },
    });

    if (!current) {
      return null;
    }

    const snapshot = await this.prisma.snapshot.findUnique({
      where: { id: current.snapshotId },
    });

    if (!snapshot) {
      return null;
    }

    return {
      domain: JSON.parse(snapshot.domainData),
      viewModel: JSON.parse(snapshot.viewModel),
    };
  }

  async getSnapshot(id: string): Promise<{ domain: PortfolioSnapshot; viewModel: DashboardVM } | null> {
    const snapshot = await this.prisma.snapshot.findUnique({
      where: { id },
    });

    if (!snapshot) {
      return null;
    }

    return {
      domain: JSON.parse(snapshot.domainData),
      viewModel: JSON.parse(snapshot.viewModel),
    };
  }

  async listSnapshots(limit: number = 20): Promise<Array<{
    id: string;
    createdAt: Date;
    actor: string | null;
    notes: string | null;
    isCurrent: boolean;
  }>> {
    const current = await this.prisma.currentSnapshot.findUnique({
      where: { id: 'current' },
    });

    const snapshots = await this.prisma.snapshot.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        createdAt: true,
        actor: true,
        notes: true,
      },
    });

    return snapshots.map(s => ({
      ...s,
      isCurrent: s.id === current?.snapshotId,
    }));
  }

  async rollback(snapshotId: string): Promise<boolean> {
    const snapshot = await this.prisma.snapshot.findUnique({
      where: { id: snapshotId },
    });

    if (!snapshot) {
      return false;
    }

    await this.prisma.currentSnapshot.upsert({
      where: { id: 'current' },
      create: { id: 'current', snapshotId },
      update: { snapshotId },
    });

    return true;
  }

  async diffSnapshots(fromId: string, toId: string): Promise<{
    headers: any;
    status: { added: any[]; removed: any[]; changed: any[] };
    highlights: { added: any[]; removed: any[] };
    lowlights: { added: any[]; removed: any[] };
    milestones: { added: any[]; removed: any[]; changed: any[] };
  }> {
    const [fromSnapshot, toSnapshot] = await Promise.all([
      this.getSnapshot(fromId),
      this.getSnapshot(toId),
    ]);

    if (!fromSnapshot || !toSnapshot) {
      throw new Error('One or both snapshots not found');
    }

    const from = fromSnapshot.domain;
    const to = toSnapshot.domain;

    // Diff headers
    const headersDiff = this.diffObjects(from.headers, to.headers);

    // Diff status
    const statusDiff = this.diffArrays(
      from.status,
      to.status,
      (item) => item.project
    );

    // Diff highlights
    const highlightsDiff = this.diffArrays(
      from.highlights,
      to.highlights,
      (item) => item.description
    );

    // Diff lowlights
    const lowlightsDiff = this.diffArrays(
      from.lowlights,
      to.lowlights,
      (item) => item.description
    );

    // Diff milestones
    const milestonesDiff = this.diffArrays(
      from.milestones,
      to.milestones,
      (item) => `${item.project}-${item.milestone}`
    );

    return {
      headers: headersDiff,
      status: statusDiff,
      highlights: highlightsDiff,
      lowlights: lowlightsDiff,
      milestones: milestonesDiff,
    };
  }

  private diffObjects(from: any, to: any): any {
    const changes: any = {};

    // Check for changed or added properties
    for (const key in to) {
      if (from[key] !== to[key]) {
        changes[key] = {
          from: from[key],
          to: to[key],
        };
      }
    }

    // Check for removed properties
    for (const key in from) {
      if (!(key in to)) {
        changes[key] = {
          from: from[key],
          to: undefined,
        };
      }
    }

    return changes;
  }

  private diffArrays<T>(
    from: T[],
    to: T[],
    keyFn: (item: T) => string
  ): { added: T[]; removed: T[]; changed: T[] } {
    const fromMap = new Map(from.map(item => [keyFn(item), item]));
    const toMap = new Map(to.map(item => [keyFn(item), item]));

    const added: T[] = [];
    const removed: T[] = [];
    const changed: T[] = [];

    // Find added and changed
    for (const [key, toItem] of toMap) {
      const fromItem = fromMap.get(key);
      if (!fromItem) {
        added.push(toItem);
      } else if (JSON.stringify(fromItem) !== JSON.stringify(toItem)) {
        changed.push(toItem);
      }
    }

    // Find removed
    for (const [key, fromItem] of fromMap) {
      if (!toMap.has(key)) {
        removed.push(fromItem);
      }
    }

    return { added, removed, changed };
  }

  async getExcelFile(snapshotId: string): Promise<Buffer | null> {
    const snapshot = await this.prisma.snapshot.findUnique({
      where: { id: snapshotId },
      select: { rawExcel: true },
    });

    return snapshot?.rawExcel || null;
  }
}