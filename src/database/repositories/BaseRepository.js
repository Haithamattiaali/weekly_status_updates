/**
 * BaseRepository - Abstract base class for all repositories
 * Provides common CRUD operations and query building
 */

import { db } from '../core/DatabaseManager.js';

export class BaseRepository {
    constructor(tableName) {
        this.tableName = tableName;
        this.db = db;
        this.queryBuilder = new QueryBuilder(tableName);
    }

    /**
     * Find a record by ID
     */
    async findById(id) {
        const sql = `SELECT * FROM ${this.tableName} WHERE id = ? LIMIT 1`;
        return await this.db.getRow(sql, [id]);
    }

    /**
     * Find multiple records by IDs
     */
    async findByIds(ids) {
        if (!ids || ids.length === 0) {
            return [];
        }

        const placeholders = ids.map(() => '?').join(',');
        const sql = `SELECT * FROM ${this.tableName} WHERE id IN (${placeholders})`;
        return await this.db.query(sql, ids);
    }

    /**
     * Find all records
     */
    async findAll(options = {}) {
        const query = this.queryBuilder.select('*');

        if (options.orderBy) {
            query.orderBy(options.orderBy, options.orderDirection || 'ASC');
        }

        if (options.limit) {
            query.limit(options.limit);
        }

        if (options.offset) {
            query.offset(options.offset);
        }

        const { sql, params } = query.build();
        return await this.db.query(sql, params);
    }

    /**
     * Find records matching conditions
     */
    async find(conditions = {}, options = {}) {
        const query = this.queryBuilder.select('*');

        Object.entries(conditions).forEach(([key, value]) => {
            if (value === null) {
                query.whereNull(key);
            } else if (Array.isArray(value)) {
                query.whereIn(key, value);
            } else {
                query.where(key, '=', value);
            }
        });

        if (options.orderBy) {
            query.orderBy(options.orderBy, options.orderDirection || 'ASC');
        }

        if (options.limit) {
            query.limit(options.limit);
        }

        if (options.offset) {
            query.offset(options.offset);
        }

        const { sql, params } = query.build();
        return await this.db.query(sql, params);
    }

    /**
     * Find first record matching conditions
     */
    async findFirst(conditions = {}, options = {}) {
        const results = await this.find(conditions, { ...options, limit: 1 });
        return results[0] || null;
    }

    /**
     * Create a new record
     */
    async create(data) {
        const fields = Object.keys(data);
        const values = Object.values(data);
        const placeholders = fields.map(() => '?').join(', ');

        const sql = `
            INSERT INTO ${this.tableName} (${fields.join(', ')})
            VALUES (${placeholders})
            RETURNING *
        `;

        const result = await this.db.query(sql, values);
        return result[0];
    }

    /**
     * Create multiple records
     */
    async createMany(dataArray) {
        if (!dataArray || dataArray.length === 0) {
            return [];
        }

        return await this.db.transaction(async (tx) => {
            const results = [];

            for (const data of dataArray) {
                const fields = Object.keys(data);
                const values = Object.values(data);
                const placeholders = fields.map(() => '?').join(', ');

                const sql = `
                    INSERT INTO ${this.tableName} (${fields.join(', ')})
                    VALUES (${placeholders})
                    RETURNING *
                `;

                await tx.execute(sql, values);
                results.push(data);
            }

            return results;
        });
    }

    /**
     * Update a record by ID
     */
    async update(id, data) {
        const fields = Object.keys(data);
        const values = Object.values(data);
        const setClause = fields.map(field => `${field} = ?`).join(', ');

        const sql = `
            UPDATE ${this.tableName}
            SET ${setClause}
            WHERE id = ?
            RETURNING *
        `;

        const result = await this.db.query(sql, [...values, id]);
        return result[0];
    }

    /**
     * Update multiple records matching conditions
     */
    async updateMany(conditions, data) {
        const query = this.queryBuilder.update(data);

        Object.entries(conditions).forEach(([key, value]) => {
            if (value === null) {
                query.whereNull(key);
            } else if (Array.isArray(value)) {
                query.whereIn(key, value);
            } else {
                query.where(key, '=', value);
            }
        });

        const { sql, params } = query.build();
        await this.db.query(sql, params);

        // Return updated records
        return await this.find(conditions);
    }

    /**
     * Delete a record by ID
     */
    async delete(id) {
        const sql = `DELETE FROM ${this.tableName} WHERE id = ? RETURNING *`;
        const result = await this.db.query(sql, [id]);
        return result[0];
    }

    /**
     * Delete multiple records by IDs
     */
    async deleteMany(ids) {
        if (!ids || ids.length === 0) {
            return [];
        }

        const placeholders = ids.map(() => '?').join(',');
        const sql = `DELETE FROM ${this.tableName} WHERE id IN (${placeholders}) RETURNING *`;
        return await this.db.query(sql, ids);
    }

    /**
     * Delete records matching conditions
     */
    async deleteWhere(conditions) {
        const query = this.queryBuilder.delete();

        Object.entries(conditions).forEach(([key, value]) => {
            if (value === null) {
                query.whereNull(key);
            } else if (Array.isArray(value)) {
                query.whereIn(key, value);
            } else {
                query.where(key, '=', value);
            }
        });

        const { sql, params } = query.build();
        return await this.db.query(sql, params);
    }

    /**
     * Count records matching conditions
     */
    async count(conditions = {}) {
        const query = this.queryBuilder.select('COUNT(*) as count');

        Object.entries(conditions).forEach(([key, value]) => {
            if (value === null) {
                query.whereNull(key);
            } else if (Array.isArray(value)) {
                query.whereIn(key, value);
            } else {
                query.where(key, '=', value);
            }
        });

        const { sql, params } = query.build();
        const result = await this.db.query(sql, params);
        return result[0]?.count || 0;
    }

    /**
     * Check if a record exists
     */
    async exists(conditions) {
        const count = await this.count(conditions);
        return count > 0;
    }

    /**
     * Execute raw SQL query
     */
    async raw(sql, params = []) {
        return await this.db.query(sql, params);
    }

    /**
     * Begin a transaction
     */
    async transaction(callback) {
        return await this.db.transaction(callback);
    }
}

/**
 * QueryBuilder - Fluent SQL query builder
 */
class QueryBuilder {
    constructor(tableName) {
        this.tableName = tableName;
        this.type = null;
        this.selectFields = [];
        this.updateData = {};
        this.whereClauses = [];
        this.orderByClause = null;
        this.limitValue = null;
        this.offsetValue = null;
        this.params = [];
    }

    select(fields = '*') {
        this.type = 'SELECT';
        if (typeof fields === 'string') {
            this.selectFields = [fields];
        } else if (Array.isArray(fields)) {
            this.selectFields = fields;
        }
        return this;
    }

    update(data) {
        this.type = 'UPDATE';
        this.updateData = data;
        return this;
    }

    delete() {
        this.type = 'DELETE';
        return this;
    }

    where(field, operator, value) {
        this.whereClauses.push({ field, operator, value, type: 'where' });
        return this;
    }

    whereNull(field) {
        this.whereClauses.push({ field, type: 'whereNull' });
        return this;
    }

    whereNotNull(field) {
        this.whereClauses.push({ field, type: 'whereNotNull' });
        return this;
    }

    whereIn(field, values) {
        this.whereClauses.push({ field, values, type: 'whereIn' });
        return this;
    }

    whereNotIn(field, values) {
        this.whereClauses.push({ field, values, type: 'whereNotIn' });
        return this;
    }

    whereBetween(field, min, max) {
        this.whereClauses.push({ field, min, max, type: 'whereBetween' });
        return this;
    }

    orderBy(field, direction = 'ASC') {
        this.orderByClause = { field, direction: direction.toUpperCase() };
        return this;
    }

    limit(value) {
        this.limitValue = value;
        return this;
    }

    offset(value) {
        this.offsetValue = value;
        return this;
    }

    build() {
        this.params = [];
        let sql = '';

        switch (this.type) {
            case 'SELECT':
                sql = this.buildSelect();
                break;
            case 'UPDATE':
                sql = this.buildUpdate();
                break;
            case 'DELETE':
                sql = this.buildDelete();
                break;
            default:
                throw new Error('Query type not specified');
        }

        return { sql, params: this.params };
    }

    buildSelect() {
        let sql = `SELECT ${this.selectFields.join(', ')} FROM ${this.tableName}`;

        const whereClause = this.buildWhereClause();
        if (whereClause) {
            sql += ` WHERE ${whereClause}`;
        }

        if (this.orderByClause) {
            sql += ` ORDER BY ${this.orderByClause.field} ${this.orderByClause.direction}`;
        }

        if (this.limitValue !== null) {
            sql += ` LIMIT ${this.limitValue}`;
        }

        if (this.offsetValue !== null) {
            sql += ` OFFSET ${this.offsetValue}`;
        }

        return sql;
    }

    buildUpdate() {
        const fields = Object.keys(this.updateData);
        const setClause = fields.map(field => {
            this.params.push(this.updateData[field]);
            return `${field} = ?`;
        }).join(', ');

        let sql = `UPDATE ${this.tableName} SET ${setClause}`;

        const whereClause = this.buildWhereClause();
        if (whereClause) {
            sql += ` WHERE ${whereClause}`;
        }

        return sql;
    }

    buildDelete() {
        let sql = `DELETE FROM ${this.tableName}`;

        const whereClause = this.buildWhereClause();
        if (whereClause) {
            sql += ` WHERE ${whereClause}`;
        }

        return sql;
    }

    buildWhereClause() {
        if (this.whereClauses.length === 0) {
            return '';
        }

        const conditions = this.whereClauses.map(clause => {
            switch (clause.type) {
                case 'where':
                    this.params.push(clause.value);
                    return `${clause.field} ${clause.operator} ?`;

                case 'whereNull':
                    return `${clause.field} IS NULL`;

                case 'whereNotNull':
                    return `${clause.field} IS NOT NULL`;

                case 'whereIn':
                    const placeholders = clause.values.map(() => {
                        this.params.push(...clause.values);
                        return '?';
                    }).join(', ');
                    return `${clause.field} IN (${placeholders})`;

                case 'whereNotIn':
                    const notPlaceholders = clause.values.map(() => {
                        this.params.push(...clause.values);
                        return '?';
                    }).join(', ');
                    return `${clause.field} NOT IN (${notPlaceholders})`;

                case 'whereBetween':
                    this.params.push(clause.min, clause.max);
                    return `${clause.field} BETWEEN ? AND ?`;

                default:
                    throw new Error(`Unknown where clause type: ${clause.type}`);
            }
        });

        return conditions.join(' AND ');
    }
}