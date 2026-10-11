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
  } catch (error) {
    // Fail-safe: log locally to stdout so an audit failure never silently breaks critical workflows,
    // but the error is prominently visible in operations logs
    console.error('CRITICAL: Failed to write encrypted audit log to database:', error);
  }
}

/**
 * Decrypt an audit log record completely for display to authorized administrators
 */
export function decryptAuditLog(rawLog: any): DecryptedAuditLog {
  const decryptedAction = decryptRandomized(rawLog.action);
  let decryptedEntityType = rawLog.entityType ? decryptRandomized(rawLog.entityType) : null;
  let decryptedEntityId = rawLog.entityId ? decryptRandomized(rawLog.entityId) : null;
  const decryptedIpAddress = rawLog.ipAddress ? decryptRandomized(rawLog.ipAddress) : null;

  // Decrypt details text
  let parsedDetails: Record<string, any> = {};
  if (rawLog.details) {
    const decryptedDetailsText = decryptRandomized(rawLog.details);
    try {
      parsedDetails = JSON.parse(decryptedDetailsText);
    } catch {
      parsedDetails = { raw: decryptedDetailsText };
    }
  }

  // Fallback for entityType and entityId if legacy records had them inside details
  if (!decryptedEntityType && parsedDetails.entityType) {
    decryptedEntityType = parsedDetails.entityType;
  }
  if (!decryptedEntityId && parsedDetails.entityId) {
    decryptedEntityId = parsedDetails.entityId;
  }
  if (!decryptedEntityId && parsedDetails.requestId) {
    decryptedEntityId = parsedDetails.requestId;
  }
  if (!decryptedEntityType && parsedDetails.requestId) {
    decryptedEntityType = 'SERVICE_REQUEST';
  }

  // Decrypt User if included
  let decryptedUser: DecryptedAuditLog['user'] = null;
  if (rawLog.user) {
    decryptedUser = {
      id: rawLog.user.id,
      email: decryptDeterministic(rawLog.user.email),
      firstName: rawLog.user.firstName ? decryptRandomized(rawLog.user.firstName) : '',
      lastName: rawLog.user.lastName ? decryptRandomized(rawLog.user.lastName) : '',
      role: rawLog.user.role,
    };
  }

  return {
    id: rawLog.id,
    userId: rawLog.userId,
    action: decryptedAction,
    entityType: decryptedEntityType,
    entityId: decryptedEntityId,
    ipAddress: decryptedIpAddress,
    createdAt: rawLog.createdAt,
    details: parsedDetails,
    user: decryptedUser,
  };
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

  const rawLogs = await prisma.auditLog.findMany({
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
      const entityNameText = (l.details.entityName || '').toLowerCase();
      const summaryText = (l.details.summary || '').toLowerCase();
      const reasonText = (l.details.reason || '').toLowerCase();
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
