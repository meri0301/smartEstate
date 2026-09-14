import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { Building } from '@smartestate/contracts';
import type { FastifyRequest } from 'fastify';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { CurrentUser, Public, Roles } from '../../common/auth/decorators.js';
import { BuildingsService } from './buildings.service.js';
import { BuildingDto, BuildingParamsDto, CreateBuildingBodyDto } from './listings.dto.js';

@ApiTags('buildings')
@Controller('buildings')
export class BuildingsController {
  constructor(private readonly buildings: BuildingsService) {}

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Building details' })
  @ApiOkResponse({ type: BuildingDto })
  @ApiNotFoundResponse()
  get(@Param() params: BuildingParamsDto): Promise<Building> {
    return this.buildings.get(params.id);
  }

  @Post()
  @Roles('AGENT', 'MODERATOR', 'ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Register a building; its district is derived from the coordinates' })
  @ApiCreatedResponse({ type: BuildingDto })
  @ApiUnprocessableEntityResponse({
    description: 'Coordinates fall outside every supported district',
  })
  @ApiConflictResponse({ description: 'Address already registered in that district' })
  create(
    @Body() body: CreateBuildingBodyDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: FastifyRequest,
  ): Promise<Building> {
    return this.buildings.create(body, user, request.ip);
  }
}
