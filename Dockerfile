FROM golang:1.25-alpine AS build
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o doomchat .

FROM alpine:3.20
RUN apk add --no-cache ca-certificates wget
WORKDIR /app
RUN mkdir -p /data && chmod 777 /data
COPY --from=build /app/doomchat .
COPY web/ web/
COPY trivia.json .
COPY release.txt .
ENV PORT=8080
ENV DATA_DIR=/data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:8080/health || exit 1
CMD ["./doomchat"]
