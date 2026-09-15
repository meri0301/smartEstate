import { interactionRecordedSchema, recordInteractionBodySchema } from '@smartestate/contracts';
import { createZodDto } from '../../common/zod/zod-dto.js';

export class RecordInteractionBodyDto extends createZodDto(recordInteractionBodySchema, {
  name: 'RecordInteractionBodyDto',
}) {}

export class InteractionRecordedDto extends createZodDto(interactionRecordedSchema, {
  name: 'InteractionRecordedDto',
  io: 'output',
}) {}
