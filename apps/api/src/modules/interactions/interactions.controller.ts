import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { InteractionRecorded } from '@smartestate/contracts';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { CurrentUser, Public } from '../../common/auth/decorators.js';
import { InteractionRecordedDto, RecordInteractionBodyDto } from './interactions.dto.js';
import { InteractionsService } from './interactions.service.js';

/** The header an anonymous browser identifies itself with. Minted client-side, kept in local storage. */
export const ANONYMOUS_ID_HEADER = 'x-anonymous-id';

@ApiTags('interactions')
@Controller('interactions')
export class InteractionsController {
  constructor(private readonly interactions: InteractionsService) {}

  @Public()
  @Post()
  @HttpCode(201)
  @ApiOperation({
    summary: 'Record what a reader did with a listing',
    description:
      'Implicit feedback: a view, a favourite, a comparison, a dismissal. With a sessionId it becomes an outcome for the ranking that showed the listing, and so for the experiment arm the session ran under. A sessionId that did not show the listing is dropped rather than stored.',
  })
  @ApiHeader({
    name: ANONYMOUS_ID_HEADER,
    required: false,
    description:
      'A stable id for an anonymous browser, so its feedback is one subject and not many',
  })
  @ApiBody({ type: RecordInteractionBodyDto })
  @ApiCreatedResponse({ type: InteractionRecordedDto })
  @ApiNotFoundResponse({ description: 'Unknown listing' })
  record(
    @Body() body: RecordInteractionBodyDto,
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Headers(ANONYMOUS_ID_HEADER) anonymousId: string | undefined,
  ): Promise<InteractionRecorded> {
    return this.interactions.record(body, {
      userId: user?.id,
      anonymousId: anonymousId?.trim() === '' ? undefined : anonymousId?.slice(0, 64),
    });
  }
}
