import type { SispTables } from '../../../../application/config';
import type { RequestMetadataRepository } from '../../../../core/contracts/storage';
import type { RequestMetadataRecord } from '../../../../domain/records';
import type {
  ListByTransactionOptions,
  NewRequestMetadata,
} from '../../../../domain/storage-types';
import {
  normalizeListLimit,
  normalizeListOffset,
  normalizeListOrder,
} from '../../knex/list-options';
import { nowIso } from '../../knex/records';
import { DELEGATE_NAMES, delegate, type PrismaClientLike } from '../client';
import { mapRequestMetadata } from '../mapping';

export function makeRequestMetadataRepository(
  client: PrismaClientLike,
  _tables: SispTables,
): RequestMetadataRepository {
  const model = () => delegate(client, DELEGATE_NAMES.requestMetadata);

  return {
    async create(data: NewRequestMetadata): Promise<void> {
      const timestamp = nowIso();

      await model().create({
        data: {
          transactionId: data.transaction_id != null ? BigInt(data.transaction_id) : null,
          ipAddress: data.ip_address,
          userAgent: data.user_agent ?? null,
          referer: data.referer ?? null,
          countryCode: data.country_code ?? null,
          countryName: data.country_name ?? null,
          region: data.region ?? null,
          city: data.city ?? null,
          latitude: data.latitude ?? null,
          longitude: data.longitude ?? null,
          isp: data.isp ?? null,
          deviceType: data.device_type ?? null,
          browser: data.browser ?? null,
          os: data.os ?? null,
          deviceFingerprint: data.device_fingerprint ?? null,
          responseTimeMs: data.response_time_ms ?? null,
          apiVersion: data.api_version ?? null,
          isVpn: data.is_vpn ?? false,
          isProxy: data.is_proxy ?? false,
          isMobile: data.is_mobile ?? false,
          riskScore: data.risk_score ?? 0,
          riskReason: data.risk_reason ?? null,
          customMetadata:
            data.custom_metadata !== undefined ? JSON.stringify(data.custom_metadata) : null,
          createdAt: new Date(timestamp),
          updatedAt: new Date(timestamp),
        },
      });
    },

    async listByTransaction(
      transactionId: number,
      options: ListByTransactionOptions = {},
    ): Promise<RequestMetadataRecord[]> {
      const rows = await model().findMany({
        where: { transactionId: BigInt(transactionId) },
        orderBy: { id: normalizeListOrder(options.order) },
        take: normalizeListLimit(options.limit),
        skip: normalizeListOffset(options.offset),
      });

      return rows.map(mapRequestMetadata);
    },
  };
}
