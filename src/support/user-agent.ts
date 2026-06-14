export function detectDeviceType(userAgent: string): string {
  const normalized = userAgent.toLowerCase();

  if (normalized.includes('tablet') || normalized.includes('ipad')) {
    return 'tablet';
  }

  if (normalized.includes('mobile') || normalized.includes('android')) {
    return 'mobile';
  }

  return 'desktop';
}

export function detectBrowser(userAgent: string): string {
  if (userAgent.includes('Chrome')) {
    return 'Chrome';
  }

  if (userAgent.includes('Firefox')) {
    return 'Firefox';
  }

  if (userAgent.includes('Safari')) {
    return 'Safari';
  }

  if (userAgent.includes('MSIE') || userAgent.includes('Trident')) {
    return 'IE';
  }

  if (userAgent.includes('Edge')) {
    return 'Edge';
  }

  return 'Unknown';
}

export function detectOperatingSystem(userAgent: string): string {
  if (/Windows/.test(userAgent)) {
    return 'Windows';
  }

  if (/Macintosh|Mac OS/.test(userAgent)) {
    return 'macOS';
  }

  if (/Linux/.test(userAgent)) {
    return 'Linux';
  }

  if (/Android/.test(userAgent)) {
    return 'Android';
  }

  if (/iOS|iPhone|iPad/.test(userAgent)) {
    return 'iOS';
  }

  return 'Unknown';
}

export function isMobileDevice(userAgent: string): boolean {
  const normalized = userAgent.toLowerCase();

  return ['mobile', 'android', 'iphone', 'ipad'].some((marker) => normalized.includes(marker));
}
