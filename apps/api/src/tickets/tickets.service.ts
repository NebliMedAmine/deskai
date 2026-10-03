import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Role,
  TicketStatus,
  UNASSIGNED,
  type Paginated,
  type TicketDetail,
  type TicketListItem,
  type TicketMessageDto,
} from '@deskai/shared';
import { isStaff, type AuthUser } from '../common/auth-user';
import { apiError } from '../common/errors';
import { paginated, resolvePage } from '../common/pagination';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateMessageDto,
  CreateTicketDto,
  TicketListQueryDto,
  UpdateTicketDto,
} from './dto/ticket.dto';
import {
  messageInclude,
  ticketDetailInclude,
  ticketListInclude,
  toMessageDto,
  toTicketDetail,
  toTicketListItem,
} from './ticket.mapper';
import { applyReply, applyStatusChange, assertCanUpdate, ticketScope } from './ticket-rules';

const ticketNotFound = () =>
  new NotFoundException(apiError('TICKET_NOT_FOUND', 'Ticket not found'));

@Injectable()
export class TicketsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(user: AuthUser, dto: CreateTicketDto): Promise<TicketDetail> {
    // Phase 3: AI triage runs here (synchronously) and seeds category/priority.
    const ticket = await this.prisma.ticket.create({
      data: { subject: dto.subject, description: dto.description, customerId: user.id },
      include: ticketDetailInclude,
    });
    return toTicketDetail(ticket, user);
  }

  async list(user: AuthUser, query: TicketListQueryDto): Promise<Paginated<TicketListItem>> {
    const { page, pageSize, skip } = resolvePage(query);
    const where: Prisma.TicketWhereInput = { AND: [ticketScope(user), buildFilters(query)] };
    const orderBy: Prisma.TicketOrderByWithRelationInput[] = [
      { [query.sortBy ?? 'createdAt']: query.sortOrder ?? 'desc' },
      { number: 'desc' }, // stable tiebreaker for pagination
    ];

    const [total, tickets] = await this.prisma.$transaction([
      this.prisma.ticket.count({ where }),
      this.prisma.ticket.findMany({
        where,
        orderBy,
        skip,
        take: pageSize,
        include: ticketListInclude,
      }),
    ]);
    return paginated(tickets.map(toTicketListItem), total, page, pageSize);
  }

  async findOne(user: AuthUser, id: string): Promise<TicketDetail> {
    const ticket = await this.prisma.ticket.findFirst({
      where: { id, ...ticketScope(user) },
      include: ticketDetailInclude,
    });
    if (!ticket) throw ticketNotFound();
    return toTicketDetail(ticket, user);
  }

  async update(user: AuthUser, id: string, dto: UpdateTicketDto): Promise<TicketDetail> {
    const current = await this.findScoped(user, id);
    assertCanUpdate(user, dto);
    if (dto.assigneeId) await this.assertAssignable(dto.assigneeId);

    const ticket = await this.prisma.ticket.update({
      where: { id },
      data: {
        ...(dto.status ? applyStatusChange(current, dto.status, new Date()) : {}),
        priority: dto.priority,
        category: dto.category,
        // undefined = leave as is, null = unassign
        ...(dto.assigneeId !== undefined ? { assigneeId: dto.assigneeId } : {}),
      },
      include: ticketDetailInclude,
    });
    return toTicketDetail(ticket, user);
  }

  async remove(id: string): Promise<void> {
    const { count } = await this.prisma.ticket.deleteMany({ where: { id } });
    if (count === 0) throw ticketNotFound();
  }

  async addMessage(
    user: AuthUser,
    ticketId: string,
    dto: CreateMessageDto,
  ): Promise<TicketMessageDto> {
    const ticket = await this.findScoped(user, ticketId);
    if (ticket.status === TicketStatus.CLOSED) {
      throw new ConflictException(
        apiError('TICKET_CLOSED', 'This ticket is closed. Reopen it before replying.'),
      );
    }
    const staff = isStaff(user.role);
    if (dto.aiDraftId) await this.assertDraftUsable(staff, ticketId, dto.aiDraftId);

    const now = new Date();
    const [message] = await this.prisma.$transaction([
      this.prisma.ticketMessage.create({
        data: { ticketId, authorId: user.id, body: dto.body, aiDraftId: dto.aiDraftId },
        include: messageInclude,
      }),
      this.prisma.ticket.update({
        where: { id: ticketId },
        data: { ...applyReply(ticket, staff, now), updatedAt: now },
      }),
    ]);
    return toMessageDto(message);
  }

  /** Loads the ticket only if the user may see it. Returns 404 (not 403) to avoid leaking existence. */
  private async findScoped(user: AuthUser, id: string) {
    const ticket = await this.prisma.ticket.findFirst({
      where: { id, ...ticketScope(user) },
      select: { status: true, resolvedAt: true, closedAt: true, firstResponseAt: true },
    });
    if (!ticket) throw ticketNotFound();
    return ticket;
  }

  private async assertAssignable(userId: string): Promise<void> {
    const assignee = await this.prisma.user.findFirst({
      where: { id: userId, isActive: true, role: { in: [Role.AGENT, Role.ADMIN] } },
      select: { id: true },
    });
    if (!assignee) {
      throw new BadRequestException(
        apiError('INVALID_ASSIGNEE', 'Tickets can only be assigned to active agents or admins'),
      );
    }
  }

  private async assertDraftUsable(
    staff: boolean,
    ticketId: string,
    draftId: string,
  ): Promise<void> {
    if (!staff) {
      throw new ForbiddenException(apiError('FORBIDDEN', 'Only staff can send AI drafts'));
    }
    const draft = await this.prisma.aiReplyDraft.findFirst({
      where: { id: draftId, ticketId },
      select: { message: { select: { id: true } } },
    });
    if (!draft) {
      throw new BadRequestException(
        apiError('INVALID_AI_DRAFT', 'AI draft not found for this ticket'),
      );
    }
    if (draft.message) {
      throw new ConflictException(
        apiError('AI_DRAFT_ALREADY_USED', 'This AI draft was already sent'),
      );
    }
  }
}

function buildFilters(query: TicketListQueryDto): Prisma.TicketWhereInput {
  const where: Prisma.TicketWhereInput = {};
  if (query.status?.length) where.status = { in: query.status };
  if (query.priority?.length) where.priority = { in: query.priority };
  if (query.category?.length) where.category = { in: query.category };
  if (query.assigneeId)
    where.assigneeId = query.assigneeId === UNASSIGNED ? null : query.assigneeId;

  if (query.search) {
    const or: Prisma.TicketWhereInput[] = [
      { subject: { contains: query.search, mode: 'insensitive' } },
      { description: { contains: query.search, mode: 'insensitive' } },
    ];
    const numberMatch = /^#?(\d{1,9})$/.exec(query.search);
    if (numberMatch?.[1]) or.push({ number: Number(numberMatch[1]) });
    where.OR = or;
  }
  return where;
}
