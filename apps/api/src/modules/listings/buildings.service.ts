import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Building, CreateBuildingBody } from '@smartestate/contracts';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { AuditService } from '../admin/audit.service.js';
import { toBuilding } from './listing.mapper.js';
import { ListingsRepository } from './listings.repository.js';

@Injectable()
export class BuildingsService {
  constructor(
    private readonly repository: ListingsRepository,
    private readonly audit: AuditService,
  ) {}

  async get(id: string): Promise<Building> {
    const row = await this.repository.findBuilding(id);
    if (row === undefined) {
      throw new NotFoundException({ message: 'Building not found', code: 'NOT_FOUND' });
    }
    return toBuilding(row);
  }

  /** The district is derived from the coordinates; points outside coverage are rejected. */
  async create(
    body: CreateBuildingBody,
    actor: AuthenticatedUser,
    ipAddress: string | undefined,
  ): Promise<Building> {
    const district = await this.repository.findDistrictContaining(
      body.location.lat,
      body.location.lon,
    );
    if (district === undefined) {
      throw new UnprocessableEntityException({
        message: 'Location is outside every supported district',
        code: 'OUTSIDE_COVERAGE',
      });
    }
    const addressLine = `${body.street.en} ${body.houseNumber}`;
    if (await this.repository.buildingExistsAt(district.id, addressLine)) {
      throw new ConflictException({
        message: 'A building with this address already exists',
        code: 'CONFLICT',
      });
    }
    const id = await this.repository.insertBuilding(district.id, addressLine, body);
    await this.audit.record({
      actorId: actor.id,
      action: 'building.create',
      entityType: 'building',
      entityId: id,
      metadata: { district: district.slug },
      ipAddress: ipAddress ?? null,
    });
    return this.get(id);
  }
}
