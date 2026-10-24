// PowerShell 5.1 cierra una cadena '...' con cualquiera de ' ‘ ’ ‚ ‛ (no sólo el apóstrofo):
// para meter texto de afuera (rutas, nombres de programas) hay que duplicar TODAS. Con sólo
// .replace(/'/g, "''"), una ruta como C:\Dani’s Games\… cortaba la cadena y lo que seguía se ejecutaba.
export const PS_QUOTES = /['\u2018\u2019\u201A\u201B]/g;
