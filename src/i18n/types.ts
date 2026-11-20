export interface Catalog {
  common: {
    appName: string;
    loading: string;
    save: string;
    cancel: string;
    confirm: string;
    continue: string;
    back: string;
    done: string;
    retry: string;
    share: string;
    copy: string;
    copied: string;
    error: string;
    offline: string;
  };
  auth: {
    signIn: string;
    signUp: string;
    emailLabel: string;
    passwordLabel: string;
    fullNameLabel: string;
    haveAccount: string;
    needAccount: string;
    signInButton: string;
    signUpButton: string;
  };
  join: {
    title: string;
    subtitle: string;
    codeLabel: string;
    codePlaceholder: string;
    joinButton: string;
    successMessage: string;
  };
  onboarding: {
    step1Title: string;
    step1Subtitle: string;
    step2Title: string;
    step2Subtitle: string;
    step3Title: string;
    step3Subtitle: string;
    businessTypeLabel: string;
    businessNameLabel: string;
    businessNamePlaceholder: string;
    slugLabel: string;
    slugAvailable: string;
    slugUnavailable: string;
    firstServiceLabel: string;
    durationLabel: string;
    readyTitle: string;
    readyDescription: string;
    copyLinkButton: string;
    goToAppButton: string;
  };
  nav: {
    today: string;
    calendar: string;
    newBooking: string;
    reminders: string;
    customers: string;
    services: string;
    reports: string;
    more: string;
    myDay: string;
    myCalendar: string;
  };
  errors: {
    generic: string;
    slotTaken: string;
    rateLimited: string;
    invalidSlug: string;
    slugTaken: string;
    invalidInvite: string;
    forbidden: string;
    cutoffPassed: string;
    outsideHours: string;
    tooSoon: string;
    tooFar: string;
    limitReached: string;
    blocked: string;
    sessionExpired: string;
  };
}
