# Use Node.js lightweight image
FROM node:18-alpine

# Create app directory
WORKDIR /usr/src/app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --production

# Copy everything else
COPY . .

# Expose the port your app runs on
EXPOSE 4002

# Start the app
CMD ["node", "index.js"]
