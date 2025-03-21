import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const app = new Hono();

app.post("/customers", async (c) => {
  const data = await c.req.json();
  const customer = await prisma.customers.create({ data });
  return c.json(customer);
});
app.get("/customers/top", async (c) => {
  const topCustomers = await prisma.customers.findMany({
    take: 5,
    orderBy: {
      orders: {
        _count: "desc",
      },
    },
    select: {
      id: true,
      name: true,
      _count: {
        select: {
          orders: true,
        },
      },
    },
  });

  interface Customer {
    id: number;
    name: string;
    _count: {
      orders: number;
    };
  }

  interface FormattedCustomer {
    id: number;
    name: string;
    orderCount: number;
  }

  const formattedCustomers: FormattedCustomer[] = topCustomers.map(
    (customer: Customer) => ({
      id: customer.id,
      name: customer.name,
      orderCount: customer._count.orders,
    })
  );

  return c.json(formattedCustomers);
});

app.get("/customers/:id", async (c) => {
  const id = Number(c.req.param("id"));

  if (isNaN(id)) {
    return c.json({ error: "Invalid ID" }, 400);
  }

  const customer = await prisma.customers.findUnique({
    where: {
      id: id,
    },
  });

  if (!customer) {
    return c.json({ error: "Customer not found" }, 404);
  }

  return c.json(customer);
});

app.get("/customers/:id/orders", async (c) => {
  const id = Number(c.req.param("id"));
  const orders = await prisma.orders.findMany({
    where: { customerId: id },
    include: { orderItems: true },
  });
  return c.json(orders);
});

app.post("/restaurants", async (c) => {
  const data = await c.req.json();
  const restaurant = await prisma.restaurants.create({ data });
  return c.json(restaurant);
});

app.get("/restaurants/:id/menu", async (c) => {
  const id = Number(c.req.param("id"));
  const menu = await prisma.menuItems.findMany({
    where: { restaurantId: id, isAvailable: true },
  });
  return c.json(menu);
});

app.post("/restaurants/:id/menu", async (c) => {
  const restaurantId = Number(c.req.param("id"));
  const data = await c.req.json();
  const menuItem = await prisma.menuItems.create({
    data: { ...data, restaurantId },
  });
  return c.json(menuItem);
});

app.patch("/menu/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const data = await c.req.json();
  const updatedItem = await prisma.menuItems.update({
    where: { id },
    data,
  });
  return c.json(updatedItem);
});

app.post("/orders", async (c) => {
  const { customerId, restaurantId, items } = await c.req.json();
  let totalPrice = 0;
  const orderItems = await Promise.all(
    items.map(async (item: any) => {
      const menuItem = await prisma.menuItems.findUnique({
        where: { id: item.menuItemId },
      });
      if (menuItem) {
        totalPrice += parseFloat(menuItem.price.toString()) * item.quantity;
        return { menuItemId: item.menuItemId, quantity: item.quantity };
      }
    })
  );
  const order = await prisma.orders.create({
    data: {
      customerId,
      restaurantId,
      totalPrice,
      orderItems: { create: orderItems },
    },
  });
  return c.json(order);
});

app.get("/orders/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const order = await prisma.orders.findUnique({
    where: { id },
    include: { orderItems: true },
  });
  return order ? c.json(order) : c.notFound();
});

app.patch("/orders/:id/status", async (c) => {
  const id = Number(c.req.param("id"));
  const { status } = await c.req.json();
  const order = await prisma.orders.update({
    where: { id },
    data: { status },
  });
  return c.json(order);
});

app.get("/restaurants/:id/revenue", async (c) => {
  const id = Number(c.req.param("id"));
  const revenue = await prisma.orders.aggregate({
    where: { restaurantId: id, status: "Completed" },
    _sum: { totalPrice: true },
  });
  return c.json({ revenue: revenue._sum.totalPrice || 0 });
});

app.get("/menu/top-items", async (c) => {
  const topItems = await prisma.orderItems.groupBy({
    by: ["menuItemId"],
    _sum: { quantity: true },
    orderBy: { _sum: { quantity: "desc" } },
    take: 1,
  });
  const itemId = topItems[0]?.menuItemId;
  const menuItem = await prisma.menuItems.findUnique({
    where: { id: itemId },
  });
  return c.json(menuItem);
});

serve(
  {
    fetch: app.fetch,
    port: 3000,
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  }
);
