# Skills de PorContar

Skills para Claude Code que se usan en la Academia PorContar. Cada una está en su carpeta, con su `SKILL.md`.

| Skill | Qué hace |
|---|---|
| [auditoria-completa](auditoria-completa/SKILL.md) | Auditoría de solo lectura de un proyecto de software, con varios agentes y verificación independiente de cada hallazgo: seguridad, lógica del negocio, arquitectura, rendimiento, dependencias, pruebas y experiencia de uso. Entrega un informe en español y un plan de corrección. |

## Cómo instalarla

En la terminal, dentro de Claude Code o en cualquier carpeta:

```
npx skills add https://github.com/LuisaPorContar/porcontar-school-oficial --skill auditoria-completa
```

Después, en Claude Code, se usa escribiendo `/auditoria-completa` o pidiendo «audita el proyecto».

También se puede copiar a mano: la carpeta `auditoria-completa` va en `~/.claude/skills/` (para todos tus proyectos) o en `.claude/skills/` dentro de un proyecto.
