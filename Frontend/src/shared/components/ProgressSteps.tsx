'use client';

import React from 'react';
import type { OnboardingStep } from '@/modules/store/types';

interface ProgressStepsProps {
  steps: OnboardingStep[];
  currentStep?: string;
}

export function ProgressSteps({ steps, currentStep }: ProgressStepsProps) {
  const completedCount = steps.filter((s) => s.completed).length;
  const progress = Math.round((completedCount / steps.length) * 100);

  return (
    <div className="progress-steps">
      <div className="progress-steps__header">
        <span className="progress-steps__label">Setup Progress</span>
        <span className="progress-steps__count">{completedCount} / {steps.length}</span>
      </div>
      <div className="progress-bar" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
        <div className="progress-bar__fill" style={{ width: `${progress}%` }} />
      </div>
      <ol className="progress-steps__list">
        {steps.map((step, index) => (
          <ProgressStep
            key={step.key}
            step={step}
            index={index + 1}
            isCurrent={step.key === currentStep}
          />
        ))}
      </ol>
    </div>
  );
}

interface ProgressStepProps {
  step: OnboardingStep;
  index: number;
  isCurrent: boolean;
}

function ProgressStep({ step, index, isCurrent }: ProgressStepProps) {
  const status = step.completed ? 'completed' : isCurrent ? 'current' : 'pending';

  return (
    <li className={`progress-step progress-step--${status}`}>
      <div className="progress-step__indicator">
        {step.completed ? (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
            <path d="M11.78 3.97a.75.75 0 0 1 0 1.06l-6 6a.75.75 0 0 1-1.06 0l-2.5-2.5a.75.75 0 0 1 1.06-1.06l1.97 1.97 5.47-5.47a.75.75 0 0 1 1.06 0z"/>
          </svg>
        ) : (
          <span>{index}</span>
        )}
      </div>
      <div className="progress-step__content">
        <span className="progress-step__label">
          {step.label}
          {step.optional && (
            <span className="progress-step__optional"> (Optional)</span>
          )}
        </span>
        <span className="progress-step__desc">{step.description}</span>
      </div>
    </li>
  );
}
