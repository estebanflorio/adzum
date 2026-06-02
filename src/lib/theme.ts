export interface Theme {
  bg:           string
  bgSecondary:  string
  border:       string
  textPrimary:  string
  textSecondary:string
  textMuted:    string
  accent:       string
  accentEnd:    string
  accentBg:     string
  accentBorder: string
  green:        string
  greenBg:      string
  greenBorder:  string
  red:          string
  redBg:        string
  amber:        string
  amberBg:      string
  blue:         string
  blueBg:       string
  cardBg:       string
  headerBg:     string
  inputBg:      string
  inputBorder:  string
  gradient:     string
}

export const darkTheme: Theme = {
  bg:            '#0a0d14',
  bgSecondary:   '#111520',
  border:        '#252a3a',
  textPrimary:   '#f0f2f8',      // casi blanco, máximo contraste
  textSecondary: '#c8ccdc',      // gris claro con tinte azul
  textMuted:     '#7c839e',      // gris medio, aún legible
  accent:        '#4d63d4',
  accentEnd:     '#00f3ff',
  accentBg:      'rgba(77,99,212,0.15)',
  accentBorder:  'rgba(0,243,255,0.3)',
  green:         '#4d63d4',
  greenBg:       'rgba(77,99,212,0.15)',
  greenBorder:   'rgba(0,243,255,0.3)',
  red:           '#ff6b6b',
  redBg:         'rgba(255,107,107,0.12)',
  amber:         '#ffaa4d',
  amberBg:       'rgba(255,170,77,0.12)',
  blue:          '#60a5fa',
  blueBg:        'rgba(96,165,250,0.12)',
  cardBg:        '#111520',
  headerBg:      '#0a0d14',
  inputBg:       '#0a0d14',
  inputBorder:   '#252a3a',
  gradient:      'linear-gradient(90deg, #3547b4 0%, #00f3ff 100%)',
}

export const lightTheme: Theme = {
  bg:            '#eef1fb',
  bgSecondary:   '#ffffff',
  border:        '#c8d0e8',
  textPrimary:   '#0a0f2e',      // casi negro azulado, máximo contraste
  textSecondary: '#1e2a5e',      // azul oscuro, muy legible
  textMuted:     '#4a5580',      // azul grisáceo, buen contraste sobre blanco
  accent:        '#2d3fa8',
  accentEnd:     '#0099aa',
  accentBg:      'rgba(45,63,168,0.1)',
  accentBorder:  'rgba(45,63,168,0.3)',
  green:         '#2d3fa8',
  greenBg:       'rgba(45,63,168,0.1)',
  greenBorder:   'rgba(45,63,168,0.3)',
  red:           '#c0000a',      // rojo oscuro, contraste AAA sobre blanco
  redBg:         '#ffe8e8',
  amber:         '#a05c00',      // marrón dorado, contraste AAA sobre blanco
  amberBg:       '#fff3e0',
  blue:          '#1a4db5',
  blueBg:        '#e8f0ff',
  cardBg:        '#ffffff',
  headerBg:      '#ffffff',
  inputBg:       '#ffffff',
  inputBorder:   '#c8d0e8',
  gradient:      'linear-gradient(90deg, #2d3fa8 0%, #0099aa 100%)',
}
