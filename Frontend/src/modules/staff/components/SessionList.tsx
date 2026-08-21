'use client';

import React from 'react';
import type { Session } from '@/modules/account/types';

interface SessionListProps {
  sessions: Session[];
  currentSessionId?: string;
  onRevoke?: (sessionId: string) => void;
}

export function SessionList({ sessions, currentSessionId, onRevoke }: SessionListProps) {
  if (sessions.length === 0) {
    return (
      <div className="session-empty">
        <p>No active sessions found.</p>
      </div>
    );
  }

  return (
    <div className="session-list animate-fade-in" id="session-list">
      <table className="staff-table">
        <thead>
          <tr>
            <th>Device</th>
            <th>Started</th>
            <th>Expires</th>
            <th>Status</th>
            {onRevoke && <th>Action</th>}
          </tr>
        </thead>
        <tbody>
          {sessions.map((session) => {
            const isCurrent = session.id === currentSessionId;
            const isExpired = new Date(session.expiresAt) < new Date();
            return (
              <tr key={session.id} className="staff-table__row">
                <td>
                  <div className="session-device">
                    <span className="session-device__icon">
                      {session.deviceInfo.platform.toLowerCase().includes('android') ? '📱'
                        : session.deviceInfo.platform.toLowerCase().includes('iphone') ? '📱'
                        : '🖥️'}
                    </span>
                    <div>
                      <span className="session-device__platform">
                        {session.deviceInfo.platform || 'Unknown device'}
                      </span>
                      <span className="session-device__agent">
                        {session.deviceInfo.userAgent.split(' ').slice(0, 3).join(' ')}...
                      </span>
                    </div>
                  </div>
                </td>
                <td className="staff-table__muted">
                  {new Date(session.createdAt).toLocaleDateString()}
                </td>
                <td className="staff-table__muted">
                  {new Date(session.expiresAt).toLocaleDateString()}
                </td>
                <td>
                  {isCurrent ? (
                    <span className="badge badge--success badge--sm">Current</span>
                  ) : isExpired ? (
                    <span className="badge badge--neutral badge--sm">Expired</span>
                  ) : (
                    <span className="badge badge--info badge--sm">Active</span>
                  )}
                </td>
                {onRevoke && (
                  <td>
                    {!isCurrent && !isExpired && (
                      <button
                        className="btn btn-danger btn-sm"
                        id={`session-revoke-${session.id}`}
                        onClick={() => onRevoke(session.id)}
                      >
                        Revoke
                      </button>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
