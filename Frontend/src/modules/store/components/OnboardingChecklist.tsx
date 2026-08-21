'use client';

import React from 'react';
import Link from 'next/link';
import type { OnboardingStep } from '@/modules/store/types';

interface OnboardingChecklistProps {
  steps: OnboardingStep[];
}

export function OnboardingChecklist({ steps }: OnboardingChecklistProps) {
  const completedCount = steps.filter((s) => s.completed && !s.optional).length;
  const requiredCount = steps.filter((s) => !s.optional).length;
  const progress = Math.round((completedCount / requiredCount) * 100);
  const allRequiredDone = completedCount === requiredCount;

  return (
    <div className="onboarding-checklist card animate-fade-in-up">
      <div className="onboarding-checklist__header">
        <div>
          <h2 className="onboarding-checklist__title">
            {allRequiredDone ? '🎉 You\'re all set!' : 'Complete Your Setup'}
          </h2>
          <p className="onboarding-checklist__subtitle">
            {allRequiredDone
              ? 'Your store is ready to use.'
              : `${completedCount} of ${requiredCount} required steps completed`}
          </p>
        </div>
        <div className="onboarding-checklist__percent">
          <svg className="onboarding-checklist__ring" viewBox="0 0 36 36" width="64" height="64">
            <circle cx="18" cy="18" r="15" fill="none" stroke="var(--color-border)" strokeWidth="2.5"/>
            <circle
              cx="18" cy="18" r="15" fill="none"
              stroke="var(--color-brand-500)" strokeWidth="2.5"
              strokeDasharray={`${(progress / 100) * 94.25} 94.25`}
              strokeLinecap="round"
              transform="rotate(-90 18 18)"
              style={{ transition: 'stroke-dasharray 0.5s ease' }}
            />
          </svg>
          <span className="onboarding-checklist__percent-label">{progress}%</span>
        </div>
      </div>

      <ol className="onboarding-checklist__steps">
        {steps.map((step, i) => (
          <ChecklistStep key={step.key} step={step} index={i + 1} />
        ))}
      </ol>
    </div>
  );
}

function ChecklistStep({ step, index }: { step: OnboardingStep; index: number }) {
  const stepContent = (
    <li
      className={[
        'checklist-step',
        step.completed ? 'checklist-step--done' : 'checklist-step--pending',
        step.optional ? 'checklist-step--optional' : '',
      ].filter(Boolean).join(' ')}
    >
      <div className="checklist-step__indicator">
        {step.completed ? (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <circle cx="8" cy="8" r="8" fill="var(--color-brand-500)" />
            <path d="M11.78 5.22a.75.75 0 0 1 0 1.06L7.31 10.75a.75.75 0 0 1-1.06 0L4.22 8.72a.75.75 0 0 1 1.06-1.06l1.5 1.5 3.94-3.94a.75.75 0 0 1 1.06 0z" fill="white"/>
          </svg>
        ) : (
          <span className="checklist-step__number">{index}</span>
        )}
      </div>
      <div className="checklist-step__body">
        <span className="checklist-step__label">
          {step.label}
          {step.optional && <span className="checklist-step__optional-tag">Optional</span>}
        </span>
        <span className="checklist-step__desc">{step.description}</span>
      </div>
      {!step.completed && (
        <svg className="checklist-step__arrow" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M6.22 3.22a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 010-1.06z"/>
        </svg>
      )}
    </li>
  );

  if (!step.completed) {
    return <Link href={step.href} style={{ display: 'contents', textDecoration: 'none' }}>{stepContent}</Link>;
  }

  return stepContent;
}
