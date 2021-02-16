# alertmanager-discord

1. Set DISCORD_WEBHOOK environment variable
2. Configure an alertmanager receiver

```yaml
receivers:
- name: 'discord'
  slack_configs:
  - api_url: http://alertmanager-discord:9096
```