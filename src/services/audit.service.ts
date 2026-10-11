import { prisma } from '../config/db';
import { encryptRandomized, decryptRandomized, decryptDeterministic } from '../utils/crypto';
import { Prisma } from '@prisma/client';

export type AuditEntityType =
  | 'GUARD'
  | 'CLIENT'
  | 'SITE'
  | 'SERVICE_REQUEST'
  | 'SHIFT'
  | 'USER'
  | 'SYSTEM';

export type AuditActionType =
  | 'GUARD_APPROVED'
  | 'GUARD_SUSPENDED'
  | 'GUARD_UPDATED'
  | 'CLIENT_APPROVED'
  | 'CLIENT_SUSPENDED'
  | 'CLIENT_UPDATED'
  | 'SITE_CREATED'
  | 'SITE_UPDATED'
  | 'SITE_REQUEST_ASSESSED'
  | 'SITE_REQUEST_APPROVED_AND_PROVISIONED'
  | 'SITE_REQUEST_REJECTED'
  | 'SHIFT_CREATED'
  | 'SHIFT_UPDATED'
  | 'SHIFT_STATUS_CHANGED'
  | 'SHIFT_CANCELLED'
  | string;

export interface CreateAuditLogParams {
  userId?: string | null;
  action: AuditActionType;
  entityType?: AuditEntityType | string | null;
  entityId?: string | null;
  entityName?: string | null;
  summary?: string | null;
  previousValues?: Record<string, any> | null;
  newValues?: Record<string, any> | null;
  reason?: string | null;
  metadata?: Record<string, any> | null;
  ipAddress?: string | null;
  tx?: Prisma.TransactionClient;
}

export interface DecryptedAuditLog {
  id: string;
  userId: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  ipAddress: string | null;
  createdAt: Date;
  details: {
    entityName?: string | null;
    summary?: string | null;
    previousValues?: Record<string, any> | null;
    newValues?: Record<string, any> | null;
    reason?: string | null;
    metadata?: Record<string, any> | null;
    [key: string]: any;
  };
  user?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
  } | null;
}

// Sensitive keys that must NEVER be recorded in audit logs
const SENSITIVE_KEY_PATTERNS = [
  'password',
  'passwordhash',
  'token',
  'tokenhash',
  'refreshtoken',
  'secret',
  'salt',
  'auth',
  'authorization',
  'cookie',
  'session',
  'apikey',
  'credentials',
  'cvv',
  'creditcard',
];

/**
 * Recursively redacts sensitive authentication credentials, passwords, tokens, and secrets
 */
export function sanitizeData(data: any): any {
  if (data === null || data === undefined) return data;
  if (typeof data !== 'object') return data;

  if (Array.isArray(data)) {
    return data.map(sanitizeData);
  }

  // Handle Date, Decimal, or other instances
  if (data instanceof Date) return data.toISOString();
  if (typeof data.toString === 'function' && data._isDecimal) return data.toString();

  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    const isSensitive = SENSITIVE_KEY_PATTERNS.some(
      (pattern) => lowerKey === pattern || lowerKey.includes(pattern)
    );

    if (isSensitive) {
      sanitized[key] = '[REDACTED]';
    } else if (value && typeof value === 'object') {
      sanitized[key] = sanitizeData(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Computes deep differences between previous and new states to avoid logging redundant attributes
 */
export function computeChangedValues(
  previous: Record<string, any> | null | undefined,
  current: Record<string, any> | null | undefined
): { previousValues: Record<string, any>; newValues: Record<string, any> } {
  if (!previous || !current) {
    return {
      previousValues: sanitizeData(previous || {}),
      newValues: sanitizeData(current || {}),
    };
  }

  const prevSanitized = sanitizeData(previous);
  const currSanitized = sanitizeData(current);
  const changedPrev: Record<string, any> = {};
  const changedCurr: Record<string, any> = {};

  const allKeys = new Set([...Object.keys(prevSanitized), ...Object.keys(currSanitized)]);
  for (const key of allKeys) {
    const prevVal = prevSanitized[key];
    const currVal = currSanitized[key];

    // Normalize JSON comparison
    const prevStr = JSON.stringify(prevVal);
    const currStr = JSON.stringify(currVal);

    if (prevStr !== currStr) {
      changedPrev[key] = prevVal;
      changedCurr[key] = currVal;
    }
  }

  return {
    previousValues: changedPrev,
    newValues: changedCurr,
  };
}

/**
 * Record an administrative action with AES-256 encryption on all fields stored in the database.
 * Every audit log field (action, entityType, entityId, details, ipAddress) is encrypted at rest.
 */
export async function recordAuditLog(params: CreateAuditLogParams): Promise<void> {
  const {
    userId,
    action,
    entityType,
    entityId,
    entityName,
    summary,
    previousValues,
    newValues,
    reason,
    metadata,
    ipAddress,
    tx,
  } = params;

  try {
    // Construct sanitized structured details payload
    const structuredDetails = {
      entityType: entityType || null,
      entityId: entityId || null,
      entityName: entityName || null,
      summary: summary || null,
      previousValues: previousValues ? sanitizeData(previousValues) : null,
      newValues: newValues ? sanitizeData(newValues) : null,
      reason: reason || null,
      metadata: metadata ? sanitizeData(metadata) : null,
    };

    // Encrypt every attribute before writing to the database
    const encryptedAction = encryptRandomized(action);
    const encryptedEntityType = entityType ? encryptRandomized(entityType) : null;
    const encryptedEntityId = entityId ? encryptRandomized(entityId) : null;
    const encryptedDetails = encryptRandomized(JSON.stringify(structuredDetails));
    const encryptedIpAddress = ipAddress ? encryptRandomized(ipAddress) : null;

    const dbClient = tx || prisma;

    try {
      await dbClient.auditLog.create({
        data: {
          userId: userId || null,
          action: encryptedAction,
          entityType: encryptedEntityType,
          entityId: encryptedEntityId,
          details: encryptedDetails,
          ipAddress: encryptedIpAddress,
        },
      });
    } catch (insertError: any) {
      // Graceful fallback if production database hasn't had the migration applied yet
      const errMsg = insertError?.message || '';
      if (errMsg.includes('entity_type') || errMsg.includes('entity_id') || insertError?.code === 'P2021' || insertError?.code === 'P2022') {
        console.warn('audit_logs table missing entity columns in production. Using raw SQL fallback...');
        await (dbClient as any).$executeRawUnsafe(
          `INSERT INTO audit_logs (id, user_id, action, details, ip_address, created_at) VALUES (UUID(), ?, ?, ?, ?, NOW())`,
          userId || null,
          encryptedAction,
          encryptedDetails,
          encryptedIpAddress
        );
      } else {
        throw insertError;
      }
    }
  } catch (error) {
    // Fail-safe: log locally to stdout so an audit failure never silently breaks critical workflows
    console.error('CRITICAL: Failed to write encrypted audit log to database:', error);
  }
}

/**
 * Decrypt an audit log record completely for display to authorized administrators
 */
export function decryptAuditLog(rawLog: any): DecryptedAuditLog {
  try {
    const decryptedAction = rawLog?.action ? decryptRandomized(rawLog.action) : 'UNKNOWN_ACTION';
    let decryptedEntityType = rawLog?.entityType ? decryptRandomized(rawLog.entityType) : null;
    let decryptedEntityId = rawLog?.entityId ? decryptRandomized(rawLog.entityId) : null;
    const decryptedIpAddress = rawLog?.ipAddress ? decryptRandomized(rawLog.ipAddress) : null;

    // Decrypt details text
    let parsedDetails: Record<string, any> = {};
    if (rawLog?.details) {
      const decryptedDetailsText = decryptRandomized(rawLog.details);
      if (decryptedDetailsText) {
        try {
          const parsed = JSON.parse(decryptedDetailsText);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            parsedDetails = parsed;
          } else {
            parsedDetails = { raw: decryptedDetailsText };
          }
        } catch {
          parsedDetails = { raw: decryptedDetailsText };
        }
      }
    }

    if (!parsedDetails || typeof parsedDetails !== 'object' || Array.isArray(parsedDetails)) {
      parsedDetails = {};
    }

    // Fallback for entityType and entityId if legacy records had them inside details
    if (!decryptedEntityType && parsedDetails.entityType) {
      decryptedEntityType = String(parsedDetails.entityType);
    }
    if (!decryptedEntityId && parsedDetails.entityId) {
      decryptedEntityId = String(parsedDetails.entityId);
    }
    if (!decryptedEntityId && parsedDetails.requestId) {
      decryptedEntityId = String(parsedDetails.requestId);
    }
    if (!decryptedEntityType && parsedDetails.requestId) {
      decryptedEntityType = 'SERVICE_REQUEST';
    }

    // Decrypt User if included
    let decryptedUser: DecryptedAuditLog['user'] = null;
    if (rawLog?.user) {
      try {
        decryptedUser = {
          id: rawLog.user.id,
          email: rawLog.user.email ? decryptDeterministic(rawLog.user.email) : '',
          firstName: rawLog.user.firstName ? decryptRandomized(rawLog.user.firstName) : '',
          lastName: rawLog.user.lastName ? decryptRandomized(rawLog.user.lastName) : '',
          role: rawLog.user.role || 'SUPER_ADMIN',
        };
      } catch (e) {
        decryptedUser = {
          id: rawLog.user.id,
          email: rawLog.user.email || '',
          firstName: '',
          lastName: '',
          role: rawLog.user.role || 'SUPER_ADMIN',
        };
      }
    }

    return {
      id: rawLog?.id || 'unknown',
      userId: rawLog?.userId || null,
      action: decryptedAction || 'UNKNOWN_ACTION',
      entityType: decryptedEntityType || null,
      entityId: decryptedEntityId || null,
      ipAddress: decryptedIpAddress || null,
      createdAt: rawLog?.createdAt || new Date(),
      details: parsedDetails,
      user: decryptedUser,
    };
  } catch (err) {
    console.error('Error in decryptAuditLog for row:', rawLog?.id, err);
    return {
      id: rawLog?.id || 'unknown',
      userId: rawLog?.userId || null,
      action: rawLog?.action || 'UNKNOWN_ACTION',
      entityType: rawLog?.entityType || null,
      entityId: rawLog?.entityId || null,
      ipAddress: rawLog?.ipAddress || null,
      createdAt: rawLog?.createdAt || new Date(),
      details: {},
      user: null,
    };
  }
}

export interface GetAuditLogsFilter {
  page?: number;
  limit?: number;
  search?: string;
  entityType?: string;
  action?: string;
  userId?: string;
  startDate?: string;
  endDate?: string;
  exportAll?: boolean;
}

/**
 * Fetch and decrypt audit logs with status filtering, multi-field search, date range, and pagination
 */
export async function getAuditLogs(filter: GetAuditLogsFilter) {
  const {
    page = 1,
    limit = 10,
    search,
    entityType,
    action,
    userId,
    startDate,
    endDate,
    exportAll = false,
  } = filter;

  const takeLimit = exportAll ? 10000 : Math.min(100, Math.max(1, limit));
  const pageNum = Math.max(1, page);

  // Fetch from database with optional user ID and date filters
  const whereClause: Prisma.AuditLogWhereInput = {};
  if (userId) {
    whereClause.userId = userId;
  }

  if (startDate || endDate) {
    whereClause.createdAt = {};
    if (startDate) {
      whereClause.createdAt.gte = new Date(startDate);
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      whereClause.createdAt.lte = end;
    }
  }

  let rawLogs: any[] = [];
  try {
    rawLogs = await prisma.auditLog.findMany({
      where: whereClause,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  } catch (dbError: any) {
    console.error('Database query error in getAuditLogs:', dbError?.message);
    const msg = dbError?.message || '';
    // If production table doesn't have entity_type or entity_id yet:
    if (msg.includes('entity_type') || msg.includes('entity_id') || dbError?.code === 'P2021' || dbError?.code === 'P2022') {
      console.warn('Running raw SQL fallback to query audit_logs without newly added columns...');
      try {
        const legacyRows: any[] = await prisma.$queryRawUnsafe(`
          SELECT 
            al.id, 
            al.user_id as userId, 
            al.action, 
            al.details, 
            al.ip_address as ipAddress, 
            al.created_at as createdAt,
            u.id as user_id,
            u.email as user_email,
            u.firstName as user_firstName,
            u.lastName as user_lastName,
            u.role as user_role
          FROM audit_logs al
          LEFT JOIN users u ON al.user_id = u.id
          ORDER BY al.created_at DESC
        `);

        rawLogs = legacyRows.map((r) => ({
          id: r.id,
          userId: r.userId,
          action: r.action,
          entityType: null,
          entityId: null,
          details: r.details,
          ipAddress: r.ipAddress,
          createdAt: r.createdAt,
          user: r.user_id
            ? {
                id: r.user_id,
                email: r.user_email,
                firstName: r.user_firstName,
                lastName: r.user_lastName,
                role: r.user_role,
              }
            : null,
        }));
      } catch (rawErr) {
        console.error('Raw SQL query fallback also failed:', rawErr);
        throw dbError;
      }
    } else {
      throw dbError;
    }
  }

  // Decrypt all records
  const decryptedLogs = rawLogs.map(decryptAuditLog);

  // Compute operational stats across all decrypted logs
  const stats = {
    total: decryptedLogs.length,
    guards: decryptedLogs.filter((l) => l.entityType === 'GUARD').length,
    clients: decryptedLogs.filter((l) => l.entityType === 'CLIENT').length,
    sites: decryptedLogs.filter((l) => l.entityType === 'SITE').length,
    requests: decryptedLogs.filter((l) => l.entityType === 'SERVICE_REQUEST').length,
    shifts: decryptedLogs.filter((l) => l.entityType === 'SHIFT').length,
  };

  // Filter by entityType if specified
  let filtered = decryptedLogs;
  if (entityType && entityType !== 'ALL') {
    filtered = filtered.filter((l) => l.entityType?.toUpperCase() === entityType.toUpperCase());
  }

  // Filter by action if specified
  if (action && action !== 'ALL') {
    filtered = filtered.filter((l) => l.action?.toUpperCase() === action.toUpperCase());
  }

  // Filter by search string across action, entityType, entityId, entityName, summary, user name, email, IP
  if (search && search.trim() !== '') {
    const q = search.trim().toLowerCase();
    filtered = filtered.filter((l) => {
      const actionText = (l.action || '').toLowerCase();
      const entityTypeText = (l.entityType || '').toLowerCase();
      const entityIdText = (l.entityId || '').toLowerCase();
      const entityNameText = (l.details?.entityName ? String(l.details.entityName) : '').toLowerCase();
      const summaryText = (l.details?.summary ? String(l.details.summary) : '').toLowerCase();
      const reasonText = (l.details?.reason ? String(l.details.reason) : '').toLowerCase();
      const ipText = (l.ipAddress || '').toLowerCase();
      const userName = `${l.user?.firstName || ''} ${l.user?.lastName || ''}`.toLowerCase();
      const userEmail = (l.user?.email || '').toLowerCase();

      return (
        actionText.includes(q) ||
        entityTypeText.includes(q) ||
        entityIdText.includes(q) ||
        entityNameText.includes(q) ||
        summaryText.includes(q) ||
        reasonText.includes(q) ||
        ipText.includes(q) ||
        userName.includes(q) ||
        userEmail.includes(q)
      );
    });
  }

  const totalCount = filtered.length;
  const totalPages = Math.ceil(totalCount / takeLimit) || 1;
  const paginatedLogs = exportAll
    ? filtered
    : filtered.slice((pageNum - 1) * takeLimit, pageNum * takeLimit);

  return {
    logs: paginatedLogs,
    pagination: {
      total: totalCount,
      page: pageNum,
      limit: takeLimit,
      totalPages,
    },
    stats,
  };
}

/**
 * Fetch a single decrypted audit log by ID
 */
export async function getAuditLogById(id: string): Promise<DecryptedAuditLog | null> {
  const rawLog = await prisma.auditLog.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
        },
      },
    },
  });

  if (!rawLog) return null;
  return decryptAuditLog(rawLog);
}

/**
 * One-time helper to encrypt any legacy unencrypted audit records in the database.
 * Ensures 100% of rows in audit_logs are encrypted at rest.
 */
export async function migrateLegacyPlaintextAuditLogs(): Promise<number> {
  const unencryptedLogs = await prisma.auditLog.findMany();
  let migratedCount = 0;

  for (const log of unencryptedLogs) {
    const isActionEncrypted = log.action.startsWith('rand:');
    const isDetailsEncrypted = log.details.startsWith('rand:');

    if (!isActionEncrypted || !isDetailsEncrypted) {
      let parsedDetails: Record<string, any> = {};
      try {
        parsedDetails = JSON.parse(log.details);
      } catch {
        parsedDetails = { raw: log.details };
      }

      const entityType = parsedDetails.siteName || parsedDetails.requestId ? 'SERVICE_REQUEST' : null;
      const entityId = parsedDetails.requestId || parsedDetails.siteId || null;
      const entityName = parsedDetails.siteName || null;

      await prisma.auditLog.update({
        where: { id: log.id },
        data: {
          action: isActionEncrypted ? log.action : encryptRandomized(log.action),
          entityType: entityType ? encryptRandomized(entityType) : log.entityType,
          entityId: entityId ? encryptRandomized(entityId) : log.entityId,
          details: isDetailsEncrypted
            ? log.details
            : encryptRandomized(
                JSON.stringify({
                  entityType,
                  entityId,
                  entityName,
                  ...parsedDetails,
                })
              ),
          ipAddress: log.ipAddress ? (log.ipAddress.startsWith('rand:') ? log.ipAddress : encryptRandomized(log.ipAddress)) : null,
        },
      });
      migratedCount++;
    }
  }

  return migratedCount;
}
