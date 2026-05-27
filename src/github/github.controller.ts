import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { SessionUser } from '../auth/auth.service';
import { GithubService } from './github.service';
import { CommitFileDto } from './dto/commit-file.dto';
import { CreatePrDto } from './dto/create-pr.dto';

function user(req: Request): SessionUser {
  return req.user as SessionUser;
}

@Controller()
@UseGuards(JwtAuthGuard)
export class GithubController {
  constructor(private readonly github: GithubService) {}

  /**
   * GET /repos
   * List repos the authenticated user owns, collaborates on, or belongs to
   * via an organisation.
   */
  @Get('repos')
  listRepos(@Req() req: Request) {
    const { accessToken } = user(req);
    return this.github.listRepos(accessToken);
  }

  /**
   * GET /repos/:owner/:repo/tree?branch=main
   * Returns the full recursive file tree for a branch.
   */
  @Get('repos/:owner/:repo/tree')
  getTree(
    @Req() req: Request,
    @Param('owner') owner: string,
    @Param('repo') repo: string,
    @Query('branch') branch?: string,
  ) {
    const { accessToken } = user(req);
    return this.github.getTree(accessToken, owner, repo, branch);
  }

  /**
   * GET /repos/:owner/:repo/file?path=src/App.tsx&branch=main
   * Returns decoded UTF-8 content + blob SHA.
   */
  @Get('repos/:owner/:repo/file')
  getFile(
    @Req() req: Request,
    @Param('owner') owner: string,
    @Param('repo') repo: string,
    @Query('path') path: string,
    @Query('branch') branch?: string,
  ) {
    const { accessToken } = user(req);
    return this.github.getFile(accessToken, owner, repo, path, branch);
  }

  /**
   * POST /repos/:owner/:repo/commit-file
   * Creates or updates a file and commits it.
   * Automatically uses a fork + branch when the user lacks push access.
   */
  @Post('repos/:owner/:repo/commit-file')
  commitFile(
    @Req() req: Request,
    @Param('owner') owner: string,
    @Param('repo') repo: string,
    @Body() dto: CommitFileDto,
  ) {
    const { accessToken, username } = user(req);
    return this.github.commitFile(accessToken, username, owner, repo, dto);
  }

  /**
   * POST /repos/:owner/:repo/create-pr
   * Opens a pull request on owner/repo.
   * For fork-based PRs, set headOwner to the fork owner's username.
   */
  @Post('repos/:owner/:repo/create-pr')
  createPr(
    @Req() req: Request,
    @Param('owner') owner: string,
    @Param('repo') repo: string,
    @Body() dto: CreatePrDto,
  ) {
    const { accessToken, username } = user(req);
    return this.github.createPr(accessToken, username, owner, repo, dto);
  }
}
