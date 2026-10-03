import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  Role,
  type Paginated,
  type SuggestReplyResponse,
  type TicketDetail,
  type TicketListItem,
  type TicketMessageDto,
} from '@deskai/shared';
import type { AuthUser } from '../common/auth-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import {
  CreateMessageDto,
  CreateTicketDto,
  TicketListQueryDto,
  UpdateTicketDto,
} from './dto/ticket.dto';
import { TicketsService } from './tickets.service';

/** Open to every authenticated role; row-level access is enforced in TicketsService. */
@Controller('tickets')
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTicketDto): Promise<TicketDetail> {
    return this.tickets.create(user, dto);
  }

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: TicketListQueryDto,
  ): Promise<Paginated<TicketListItem>> {
    return this.tickets.list(user, query);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TicketDetail> {
    return this.tickets.findOne(user, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTicketDto,
  ): Promise<TicketDetail> {
    return this.tickets.update(user, id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.tickets.remove(id);
  }

  @Post(':id/messages')
  addMessage(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateMessageDto,
  ): Promise<TicketMessageDto> {
    return this.tickets.addMessage(user, id, dto);
  }

  @Post(':id/suggest-reply')
  @Roles(Role.AGENT, Role.ADMIN)
  suggestReply(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SuggestReplyResponse> {
    return this.tickets.suggestReply(user, id);
  }
}
