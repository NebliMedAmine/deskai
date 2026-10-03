import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID, Length, MaxLength, ValidateIf } from 'class-validator';
import {
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_SORT_FIELDS,
  TICKET_STATUSES,
  UNASSIGNED,
  type CreateMessageRequest,
  type CreateTicketRequest,
  type SortOrder,
  type TicketCategory,
  type TicketListQuery,
  type TicketPriority,
  type TicketSortField,
  type TicketStatus,
  type UpdateTicketRequest,
} from '@deskai/shared';
import { PaginationQueryDto } from '../../common/pagination';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Accepts `?status=OPEN&status=PENDING` and `?status=OPEN,PENDING`. */
const toArray = ({ value }: { value: unknown }): unknown[] => {
  const list: unknown[] = Array.isArray(value) ? value : [value];
  return list.flatMap((v) => (typeof v === 'string' ? v.split(',') : [v])).filter((v) => v !== '');
};

export class CreateTicketDto implements CreateTicketRequest {
  @Transform(trim)
  @IsString()
  @Length(5, 200)
  subject: string;

  @Transform(trim)
  @IsString()
  @Length(10, 5000)
  description: string;
}

export class UpdateTicketDto implements UpdateTicketRequest {
  @IsOptional()
  @IsIn(TICKET_STATUSES)
  status?: TicketStatus;

  @IsOptional()
  @IsIn(TICKET_PRIORITIES)
  priority?: TicketPriority;

  @IsOptional()
  @IsIn(TICKET_CATEGORIES)
  category?: TicketCategory;

  /** `null` is meaningful here (unassign), so only validate when a value is present. */
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsUUID()
  assigneeId?: string | null;
}

export class CreateMessageDto implements CreateMessageRequest {
  @Transform(trim)
  @IsString()
  @Length(1, 5000)
  body: string;

  @IsOptional()
  @IsUUID()
  aiDraftId?: string;
}

export class TicketListQueryDto extends PaginationQueryDto implements TicketListQuery {
  @IsOptional()
  @Transform(toArray)
  @IsIn(TICKET_STATUSES, { each: true })
  status?: TicketStatus[];

  @IsOptional()
  @Transform(toArray)
  @IsIn(TICKET_PRIORITIES, { each: true })
  priority?: TicketPriority[];

  @IsOptional()
  @Transform(toArray)
  @IsIn(TICKET_CATEGORIES, { each: true })
  category?: TicketCategory[];

  /** A user id, or "unassigned" */
  @ValidateIf((_, value) => value !== undefined && value !== UNASSIGNED)
  @IsUUID()
  assigneeId?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsIn(TICKET_SORT_FIELDS)
  sortBy?: TicketSortField;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: SortOrder;
}
