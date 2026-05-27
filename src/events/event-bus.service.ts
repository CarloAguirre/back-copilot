import { Injectable } from '@nestjs/common';
import { Observable, Subject, interval } from 'rxjs';
import { filter, map, merge as mergeOp } from 'rxjs/operators';
import { mergeWith } from 'rxjs';

interface BusMessage {
  workspaceId: string;
  data: Record<string, any>;
}

@Injectable()
export class EventBusService {
  private readonly subject = new Subject<BusMessage>();

  emit(workspaceId: string, data: Record<string, any>): void {
    this.subject.next({ workspaceId, data });
  }

  /** Returns an observable filtered to a single workspace.
   *  Includes a 30s heartbeat so the SSE connection stays alive on Render. */
  stream(workspaceId: string): Observable<Record<string, any>> {
    const events$ = this.subject.pipe(
      filter((msg) => msg.workspaceId === workspaceId),
      map((msg) => msg.data),
    );
    const heartbeat$ = interval(30_000).pipe(map(() => ({ type: 'heartbeat' })));
    return events$.pipe(mergeWith(heartbeat$));
  }
}
