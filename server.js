import express from "express";
import dotenv from "dotenv";
import cluster from "cluster";
import os from "os";
import winston from "winston";
import pLimit from "p-limit";

const logger = winston.createLogger({
    transports: [
      new winston.transports.File({ filename: 'task_logs.log' })
    ]
  });

  const RATE_LIMIT_SECOND = 1; 
  const RATE_LIMIT_MINUTE = 20;

  const userTaskQueue=new Map();

  async function task(userId) {
    const timestamp = new Date().toISOString();
    console.log(`${userId}-task completed at-${timestamp}`);
    logger.info(`${userId}-task completed at-${timestamp}`);
    
  }