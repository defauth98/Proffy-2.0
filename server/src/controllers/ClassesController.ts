import { Request, Response } from 'express';

import db from '../database/connection';
import covertHourToMinutes from '../utils/convertHourToMinutes';

interface ScheduleItem {
  id: string;
  week_day: number;
  from: string;
  to: string;
}

export default class ClassesController {
  async index(request: Request, response: Response) {
    const { id } = request.params;
    const { page } = request.query;

    if (id) {
      const userClass = await db('classes').where({ user_id: id });
      const classSchedule = await db('class_schedule').where({
        class_id: userClass[0].id,
      });

      response
        .status(200)
        .json({ class: userClass[0], schedule: classSchedule });
    }

    const filters = request.query;

    const subject = filters.subject as string;
    const week_day = filters.week_day as string;
    const time = filters.time as string;

    if (!filters.week_day || !filters.subject || !filters.time) {
      return response.status(400).json({
        error: 'Missing filters to search classes',
      });
    }

    const timeInMinutes = covertHourToMinutes(time);

    const classes = await db('classes')
      .whereExists(function () {
        this.select('class_schedule.*')
          .from('class_schedule')
          .whereRaw('`class_schedule`.`class_id` = `classes`.`id`')
          .whereRaw('`class_schedule`.`week_day` = ??', [Number(week_day)])
          .whereRaw('`class_schedule`.`from` <= ?? ', [timeInMinutes])
          .whereRaw('`class_schedule`.`to` > ?? ', [timeInMinutes]);
      })
      .where('classes.subject', '=', subject)
      .join('users', 'classes.user_id', '=', 'users.id')
      .select(['classes.*', 'users.*'])
      .limit(5)
      .offset(((page as any) - 1) * 5);
    return response.json(classes);
  }

  async create(request: Request, response: Response) {
    const { subject, cost, schedule, user_id } = request.body;

    const trx = await db.transaction();

    try {
      const insertedClassesIds = await trx('classes').insert({
        subject,
        cost,
        user_id,
      });

      const class_id = insertedClassesIds[0];

      const classSchedule = schedule.map((scheduleItem: ScheduleItem) => {
        return {
          class_id,
          week_day: scheduleItem.week_day,
          from: covertHourToMinutes(scheduleItem.from),
          to: covertHourToMinutes(scheduleItem.to),
        };
      });

      await trx('class_schedule').insert(classSchedule);

      await trx.commit();

      return response.status(201).send();
    } catch (error) {
      await trx.rollback();

      return response.status(400).json({
        error: 'Unexpected error while creating new class',
      });
    }
  }

  async update(request: Request, response: Response) {
    const { id } = request.params;
    const { subject, cost, schedule } = request.body;

    const updatedClassID = await db('classes')
      .update({
        subject,
        cost,
      })
      .where({ user_id: id });

    schedule.map(async (scheduleItem: ScheduleItem) => {
      await db('class_schedule')
        .update({
          week_day: scheduleItem.week_day,
          from: covertHourToMinutes(scheduleItem.from),
          to: covertHourToMinutes(scheduleItem.to),
        })
        .where({ id: scheduleItem.id });
    });

    return response.status(200).json({ updatedClassID });
  }
}
