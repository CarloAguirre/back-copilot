import { Injectable } from '@nestjs/common';
import { PassportSerializer } from '@nestjs/passport';
import { SessionUser } from './auth.service';

/**
 * Stores the full SessionUser in the server-side express-session.
 * The browser only ever sees an opaque session ID cookie – the access token
 * never leaves the server.
 */
@Injectable()
export class SessionSerializer extends PassportSerializer {
  serializeUser(user: SessionUser, done: (err: any, id: any) => void) {
    done(null, user);
  }

  deserializeUser(payload: SessionUser, done: (err: any, user: any) => void) {
    done(null, payload);
  }
}
