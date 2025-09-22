/**
 * SnapshotRepository - Repository for managing portfolio snapshots
 */

import { BaseRepository } from './BaseRepository.js';
import { db } from '../core/DatabaseManager.js';

export class SnapshotRepository extends BaseRepository {
    constructor() {
        super('snapshots');
    }

    /**
     * Create a new snapshot with all related data
     */
    async createSnapshot(snapshotData) {
        return await this.transaction(async (tx) => {
            // Generate unique ID
            const snapshotId = this.generateId();

            // Parse domain data and view model
            const { domainData, viewModel, headers, status, highlights, lowlights, milestones, metrics, rawExcel, actor, notes } = snapshotData;

            // Create main snapshot record
            await tx.execute(
                `INSERT INTO snapshots (id, actor, notes, raw_excel, domain_data, view_model, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
                [snapshotId, actor, notes, rawExcel, JSON.stringify(domainData), JSON.stringify(viewModel)]
            );

            // Create headers
            if (headers) {
                await tx.execute(
                    `INSERT INTO headers (snapshot_id, portfolio, current_period_start, current_period_end,
                     comparison_period_start, comparison_period_end, report_date, section_titles, table_headers)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        snapshotId,
                        headers.portfolio,
                        headers.currentPeriodStart,
                        headers.currentPeriodEnd,
                        headers.comparisonPeriodStart,
                        headers.comparisonPeriodEnd,
                        headers.reportDate,
                        JSON.stringify(headers.sectionTitles),
                        JSON.stringify(headers.tableHeaders)
                    ]
                );
            }

            // Create status records
            if (status && status.length > 0) {
                for (let i = 0; i < status.length; i++) {
                    const s = status[i];
                    await tx.execute(
                        `INSERT INTO status (snapshot_id, project, status_color, trend, manager, next_milestone, order_index)
                         VALUES (?, ?, ?, ?, ?, ?, ?)`,
                        [snapshotId, s.project, s.statusColor, s.trend, s.manager, s.nextMilestone, i]
                    );
                }
            }

            // Create highlights
            if (highlights && highlights.length > 0) {
                for (let i = 0; i < highlights.length; i++) {
                    const h = highlights[i];
                    await tx.execute(
                        `INSERT INTO highlights (snapshot_id, project, description, order_index)
                         VALUES (?, ?, ?, ?)`,
                        [snapshotId, h.project, h.description, i]
                    );
                }
            }

            // Create lowlights
            if (lowlights && lowlights.length > 0) {
                for (let i = 0; i < lowlights.length; i++) {
                    const l = lowlights[i];
                    await tx.execute(
                        `INSERT INTO lowlights (snapshot_id, project, description, order_index)
                         VALUES (?, ?, ?, ?)`,
                        [snapshotId, l.project, l.description, i]
                    );
                }
            }

            // Create milestones
            if (milestones && milestones.length > 0) {
                for (let i = 0; i < milestones.length; i++) {
                    const m = milestones[i];
                    await tx.execute(
                        `INSERT INTO milestones (snapshot_id, project, milestone, owner, due_date, status_badge, workstream_update, order_index)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                        [snapshotId, m.project, m.milestone, m.owner, m.dueDate, m.statusBadge, m.workstreamUpdate, i]
                    );
                }
            }

            // Create metrics
            if (metrics && metrics.length > 0) {
                for (const m of metrics) {
                    await tx.execute(
                        `INSERT INTO metrics (snapshot_id, project, spi, cpi, sev1_defects, sev2_defects, issues, risk_score, milestone_completion)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [snapshotId, m.project, m.spi, m.cpi, m.sev1Defects, m.sev2Defects, m.issues, m.riskScore, m.milestoneCompletion]
                    );
                }
            }

            // Update current snapshot pointer
            await tx.execute(
                `INSERT OR REPLACE INTO current_snapshot (id, snapshot_id, updated_at)
                 VALUES ('current', ?, datetime('now'))`,
                [snapshotId]
            );

            // Add to version history
            await tx.execute(
                `INSERT INTO version_history (snapshot_id, action, actor, changes, created_at)
                 VALUES (?, 'create', ?, ?, datetime('now'))`,
                [snapshotId, actor || 'system', JSON.stringify({ type: 'snapshot_created', snapshotId })]
            );

            return snapshotId;
        });
    }

    /**
     * Get current snapshot with all related data
     */
    async getCurrentSnapshot() {
        // Get current snapshot ID
        const current = await db.getRow('SELECT snapshot_id FROM current_snapshot WHERE id = ?', ['current']);

        if (!current) {
            return null;
        }

        return await this.getSnapshotWithRelations(current.snapshot_id);
    }

    /**
     * Get snapshot with all related data
     */
    async getSnapshotWithRelations(snapshotId) {
        const snapshot = await this.findById(snapshotId);

        if (!snapshot) {
            return null;
        }

        // Parse JSON fields
        snapshot.domainData = JSON.parse(snapshot.domain_data);
        snapshot.viewModel = JSON.parse(snapshot.view_model);

        // Get related data in parallel
        const [headers, status, highlights, lowlights, milestones, metrics] = await Promise.all([
            db.getRow('SELECT * FROM headers WHERE snapshot_id = ?', [snapshotId]),
            db.query('SELECT * FROM status WHERE snapshot_id = ? ORDER BY order_index', [snapshotId]),
            db.query('SELECT * FROM highlights WHERE snapshot_id = ? ORDER BY order_index', [snapshotId]),
            db.query('SELECT * FROM lowlights WHERE snapshot_id = ? ORDER BY order_index', [snapshotId]),
            db.query('SELECT * FROM milestones WHERE snapshot_id = ? ORDER BY order_index', [snapshotId]),
            db.query('SELECT * FROM metrics WHERE snapshot_id = ?', [snapshotId])
        ]);

        // Parse headers JSON fields
        if (headers) {
            headers.sectionTitles = headers.section_titles ? JSON.parse(headers.section_titles) : null;
            headers.tableHeaders = headers.table_headers ? JSON.parse(headers.table_headers) : null;
        }

        return {
            ...snapshot,
            headers,
            status,
            highlights,
            lowlights,
            milestones,
            metrics
        };
    }

    /**
     * Get snapshot history
     */
    async getSnapshotHistory(limit = 10, offset = 0) {
        const snapshots = await db.query(
            `SELECT s.id, s.created_at, s.actor, s.notes, h.portfolio, h.report_date
             FROM snapshots s
             LEFT JOIN headers h ON s.id = h.snapshot_id
             ORDER BY s.created_at DESC
             LIMIT ? OFFSET ?`,
            [limit, offset]
        );

        // Get counts for each snapshot
        for (const snapshot of snapshots) {
            const counts = await db.getRow(
                `SELECT
                    (SELECT COUNT(*) FROM status WHERE snapshot_id = ?) as status_count,
                    (SELECT COUNT(*) FROM milestones WHERE snapshot_id = ?) as milestone_count,
                    (SELECT COUNT(*) FROM highlights WHERE snapshot_id = ?) as highlight_count,
                    (SELECT COUNT(*) FROM lowlights WHERE snapshot_id = ?) as lowlight_count`,
                [snapshot.id, snapshot.id, snapshot.id, snapshot.id]
            );

            Object.assign(snapshot, counts);
        }

        return snapshots;
    }

    /**
     * Compare two snapshots
     */
    async compareSnapshots(snapshotId1, snapshotId2) {
        const [snapshot1, snapshot2] = await Promise.all([
            this.getSnapshotWithRelations(snapshotId1),
            this.getSnapshotWithRelations(snapshotId2)
        ]);

        if (!snapshot1 || !snapshot2) {
            throw new Error('One or both snapshots not found');
        }

        const comparison = {
            metadata: {
                snapshot1: {
                    id: snapshot1.id,
                    createdAt: snapshot1.created_at,
                    portfolio: snapshot1.headers?.portfolio
                },
                snapshot2: {
                    id: snapshot2.id,
                    createdAt: snapshot2.created_at,
                    portfolio: snapshot2.headers?.portfolio
                }
            },
            changes: {
                status: this.compareArrays(snapshot1.status, snapshot2.status, 'project'),
                milestones: this.compareArrays(snapshot1.milestones, snapshot2.milestones, ['project', 'milestone']),
                highlights: {
                    added: snapshot2.highlights.filter(h2 =>
                        !snapshot1.highlights.some(h1 => h1.description === h2.description)
                    ),
                    removed: snapshot1.highlights.filter(h1 =>
                        !snapshot2.highlights.some(h2 => h2.description === h1.description)
                    )
                },
                lowlights: {
                    added: snapshot2.lowlights.filter(l2 =>
                        !snapshot1.lowlights.some(l1 => l1.description === l2.description)
                    ),
                    removed: snapshot1.lowlights.filter(l1 =>
                        !snapshot2.lowlights.some(l2 => l2.description === l1.description)
                    )
                },
                metrics: this.compareMetrics(snapshot1.metrics, snapshot2.metrics)
            }
        };

        return comparison;
    }

    /**
     * Compare arrays of objects
     */
    compareArrays(arr1, arr2, keyFields) {
        const keys = Array.isArray(keyFields) ? keyFields : [keyFields];

        const getKey = (obj) => keys.map(k => obj[k]).join('::');

        const map1 = new Map(arr1.map(item => [getKey(item), item]));
        const map2 = new Map(arr2.map(item => [getKey(item), item]));

        const added = [];
        const removed = [];
        const changed = [];

        // Find added and changed
        for (const [key, item2] of map2) {
            const item1 = map1.get(key);
            if (!item1) {
                added.push(item2);
            } else if (JSON.stringify(item1) !== JSON.stringify(item2)) {
                changed.push({ before: item1, after: item2 });
            }
        }

        // Find removed
        for (const [key, item1] of map1) {
            if (!map2.has(key)) {
                removed.push(item1);
            }
        }

        return { added, removed, changed };
    }

    /**
     * Compare metrics
     */
    compareMetrics(metrics1, metrics2) {
        const map1 = new Map(metrics1.map(m => [m.project, m]));
        const map2 = new Map(metrics2.map(m => [m.project, m]));

        const changes = [];

        for (const [project, m2] of map2) {
            const m1 = map1.get(project);
            if (m1) {
                const projectChanges = {};

                ['spi', 'cpi', 'sev1_defects', 'sev2_defects', 'issues', 'risk_score', 'milestone_completion'].forEach(field => {
                    if (m1[field] !== m2[field]) {
                        projectChanges[field] = {
                            before: m1[field],
                            after: m2[field],
                            delta: m2[field] - m1[field]
                        };
                    }
                });

                if (Object.keys(projectChanges).length > 0) {
                    changes.push({ project, changes: projectChanges });
                }
            }
        }

        return changes;
    }

    /**
     * Delete old snapshots (keep most recent N)
     */
    async pruneSnapshots(keepCount = 30) {
        const snapshots = await db.query(
            `SELECT id FROM snapshots
             ORDER BY created_at DESC
             LIMIT -1 OFFSET ?`,
            [keepCount]
        );

        if (snapshots.length === 0) {
            return 0;
        }

        const idsToDelete = snapshots.map(s => s.id);

        // Delete in transaction
        await this.transaction(async (tx) => {
            for (const id of idsToDelete) {
                await tx.execute('DELETE FROM snapshots WHERE id = ?', [id]);
            }

            // Add to version history
            await tx.execute(
                `INSERT INTO version_history (action, actor, changes, created_at)
                 VALUES ('prune', 'system', ?, datetime('now'))`,
                [JSON.stringify({ deleted: idsToDelete.length, keepCount })]
            );
        });

        console.log(`[SnapshotRepository] Pruned ${idsToDelete.length} old snapshots`);
        return idsToDelete.length;
    }

    /**
     * Generate unique ID (similar to cuid)
     */
    generateId() {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substring(2, 15);
        const counter = (Math.random() * 1000000).toString(36).substring(0, 4);
        return `c${timestamp}${random}${counter}`;
    }

    /**
     * Search snapshots by various criteria
     */
    async searchSnapshots(criteria) {
        let sql = `
            SELECT DISTINCT s.*, h.portfolio, h.report_date
            FROM snapshots s
            LEFT JOIN headers h ON s.id = h.snapshot_id
            WHERE 1=1
        `;
        const params = [];

        if (criteria.portfolio) {
            sql += ' AND h.portfolio LIKE ?';
            params.push(`%${criteria.portfolio}%`);
        }

        if (criteria.actor) {
            sql += ' AND s.actor LIKE ?';
            params.push(`%${criteria.actor}%`);
        }

        if (criteria.dateFrom) {
            sql += ' AND s.created_at >= ?';
            params.push(criteria.dateFrom);
        }

        if (criteria.dateTo) {
            sql += ' AND s.created_at <= ?';
            params.push(criteria.dateTo);
        }

        if (criteria.hasProject) {
            sql += ` AND EXISTS (
                SELECT 1 FROM status st
                WHERE st.snapshot_id = s.id
                AND st.project LIKE ?
            )`;
            params.push(`%${criteria.hasProject}%`);
        }

        sql += ' ORDER BY s.created_at DESC';

        if (criteria.limit) {
            sql += ' LIMIT ?';
            params.push(criteria.limit);
        }

        return await db.query(sql, params);
    }
}

// Export singleton instance
export const snapshotRepository = new SnapshotRepository();