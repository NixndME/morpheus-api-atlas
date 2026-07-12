FROM node:20-alpine
WORKDIR /atlas
COPY server.js .
COPY app ./app
EXPOSE 2222
ENV PORT=2222
# Optional: pin the relay to a single Morpheus host
# ENV ALLOWED_HOST=morpheus.yourco.com
USER node
CMD ["node", "server.js"]
