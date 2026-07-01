# Этап сборки
FROM node:22-alpine AS builder
ARG REACT_APP_API_BASE_URL
ARG BASE_URL
ENV REACT_APP_API_BASE_URL=$REACT_APP_API_BASE_URL
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

# Этап продакшена
FROM nginx:alpine
ARG BASE_URL
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/build /usr/share/nginx/html

RUN sed -i "s|{{BASE_URL}}|${BASE_URL}|g" /usr/share/nginx/html/index.html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]