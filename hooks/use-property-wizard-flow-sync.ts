import { useEffect, useMemo, useRef } from 'react';

import type { FlowStateResetApi } from '@/lib/properties/flow-state-reset';
import { resetFieldsNotInFlow } from '@/lib/properties/flow-state-reset';
import {
  getFlowSteps,
  isStepInFlow,
  type PropertyFlowKey,
  type WizardStep,
} from '@/lib/properties/wizard-flow';

type UsePropertyWizardFlowSyncArgs = {
  flowKey: PropertyFlowKey;
  step: WizardStep;
  setStep: (step: WizardStep) => void;
  setPickerOpen: (value: null) => void;
  setError: (value: string | null) => void;
  resetApi: FlowStateResetApi;
  onCategoryDefaultPropertyType?: (category: 'residential' | 'commercial' | 'land_plot') => void;
};

export function usePropertyWizardFlowSync({
  flowKey,
  step,
  setStep,
  setPickerOpen,
  setError,
  resetApi,
}: UsePropertyWizardFlowSyncArgs) {
  const prevFlowKeyRef = useRef<PropertyFlowKey | null>(null);
  const currentFlowSteps = useMemo(() => getFlowSteps(flowKey), [flowKey]);

  const stepInFlow = isStepInFlow(step, flowKey);
  const getCurrentStepIndex = stepInFlow ? currentFlowSteps.indexOf(step) : -1;
  const displayStepIndex = stepInFlow ? getCurrentStepIndex : 0;

  const canGoNext = stepInFlow && getCurrentStepIndex < currentFlowSteps.length - 1;
  const canGoBack = stepInFlow && getCurrentStepIndex > 0;

  const getNextStep = canGoNext ? currentFlowSteps[getCurrentStepIndex + 1] : null;
  const getPreviousStep = canGoBack ? currentFlowSteps[getCurrentStepIndex - 1] : null;

  useEffect(() => {
    const prev = prevFlowKeyRef.current;
    if (prev === null) {
      prevFlowKeyRef.current = flowKey;
      return;
    }
    if (prev === flowKey) return;

    prevFlowKeyRef.current = flowKey;
    resetFieldsNotInFlow(flowKey, resetApi);
    setPickerOpen(null);
    setError(null);
    setStep('basic');
  }, [flowKey, resetApi, setError, setPickerOpen, setStep]);

  useEffect(() => {
    if (!stepInFlow) setStep('basic');
  }, [stepInFlow, setStep]);

  return {
    currentFlowSteps,
    stepInFlow,
    getCurrentStepIndex: displayStepIndex,
    canGoNext,
    canGoBack,
    getNextStep,
    getPreviousStep,
  };
}
