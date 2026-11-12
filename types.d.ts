import type {uk} from './uk'

/**
 * Розширення типів i18next:
 * автокомпліт і перевірка t('profile.modal.clear') при компіляції.
 *
 * Локалі живуть у @root/dto — звідти беремо typeof en як джерело правди.
 */
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation'
    resources: {
      translation: typeof uk
    }
  }
}