import { Controller, Get, Param } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { District, DistrictBoundaryResponse } from '@smartestate/contracts';
import { Public } from '../../common/auth/decorators.js';
import { DistrictBoundaryResponseDto, DistrictDto, DistrictParamsDto } from './geo.dto.js';
import { GeoService } from './geo.service.js';

@ApiTags('geo')
@Public()
@Controller('districts')
export class GeoController {
  constructor(private readonly geo: GeoService) {}

  @Get()
  @ApiOperation({ summary: 'All districts and towns with trilingual names and centroids' })
  @ApiOkResponse({ type: [DistrictDto] })
  listDistricts(): Promise<District[]> {
    return this.geo.listDistricts();
  }

  @Get(':slug/boundary')
  @ApiOperation({ summary: 'District boundary as a GeoJSON MultiPolygon' })
  @ApiOkResponse({ type: DistrictBoundaryResponseDto })
  @ApiNotFoundResponse({ description: 'Unknown district slug' })
  getBoundary(@Param() params: DistrictParamsDto): Promise<DistrictBoundaryResponse> {
    return this.geo.getBoundary(params.slug);
  }
}
