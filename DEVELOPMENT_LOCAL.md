# Local Development and Debug Environments

This document is a collection of resources that may be helpful to new ceramic developers.  To get you up and running quickly, the following steps should address all major "gotchas" to get a vanilla dev machine up and running as quickly as possible.

## Building Locally

Before running or debugging locally build the project by

```
cd agent
npm ci --only-production
```

## IDE configuration

### WebStorm

Open the ceramic-stats project.  Set the Run/Debug configuration template (under Run..Edit Configuration..Edit Configuration Templates) as follows:

![image](https://user-images.githubusercontent.com/798887/171948613-9c996f0d-4cff-4b70-98ec-690897dabbae.png)
