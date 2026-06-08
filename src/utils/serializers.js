export const sanitizeUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  avatarColor: user.avatarColor,
  createdAt: user.createdAt
});

export const serializeProject = (project) => ({
  ...project,
  owner: project.owner
    ? sanitizeUser(project.owner)
    : undefined,
  members: project.members?.map((member) => ({
    ...member,
    user: sanitizeUser(member.user)
  })),
  tasks: project.tasks?.map((task) => ({
    ...task,
    assignee: task.assignee ? sanitizeUser(task.assignee) : null,
    reporter: task.reporter ? sanitizeUser(task.reporter) : null,
    comments: task.comments?.map((comment) => ({
      ...comment,
      user: sanitizeUser(comment.user)
    }))
  }))
});
