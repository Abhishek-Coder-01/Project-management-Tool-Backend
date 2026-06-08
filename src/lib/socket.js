let ioRef = null;

export const setIO = (io) => {
  ioRef = io;
};

export const getIO = () => ioRef;

export const emitProjectUpdate = (projectId, event, payload) => {
  ioRef?.to(`project:${projectId}`).emit('project:update', { event, payload });
};

export const emitUserNotification = (userId, notification) => {
  ioRef?.to(`user:${userId}`).emit('notification:new', notification);
};
